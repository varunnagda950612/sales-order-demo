-- Apply this migration before setting NEXT_PUBLIC_SUPABASE_WRITE_MODE=enabled.
-- It makes order/items/proof and collection sync idempotent without deleting history.

alter table public.orders
  add column if not exists client_updated_at timestamptz;

update public.orders
set client_updated_at = coalesce(updated_at, created_at, now())
where client_updated_at is null;

alter table public.orders
  alter column client_updated_at set default now(),
  alter column client_updated_at set not null;

create index if not exists orders_client_updated_at_idx
on public.orders(client_updated_at desc);

-- No order payload is retained here. The UUID prevents a delayed sync from
-- recreating an order after an explicit admin hard delete.
create table if not exists public.deleted_order_ids (
  order_id uuid primary key,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_order_ids enable row level security;
revoke all on table public.deleted_order_ids from anon, authenticated;

create or replace function public.prevent_deleted_order_recreation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.deleted_order_ids deleted_order
    where deleted_order.order_id = new.id
  ) then
    raise exception 'This order was permanently deleted and cannot be recreated.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_prevent_deleted_recreation on public.orders;

create trigger orders_prevent_deleted_recreation
before insert on public.orders
for each row execute function public.prevent_deleted_order_recreation();

alter table public.visit_proofs
  add column if not exists client_event_id uuid;

create unique index if not exists visit_proofs_client_event_id_key
on public.visit_proofs(client_event_id);

create index if not exists visit_proofs_dedupe_window_idx
on public.visit_proofs(shop_id, sales_person_id, visit_type, captured_at desc);

alter table public.collections
  add column if not exists client_group_id uuid,
  add column if not exists status text,
  add column if not exists updated_at timestamptz,
  add column if not exists client_updated_at timestamptz;

update public.collections
set client_group_id = id
where client_group_id is null;

update public.collections
set status = 'placed'
where status is null;

update public.collections
set updated_at = created_at
where updated_at is null;

update public.collections
set client_updated_at = coalesce(updated_at, created_at, now())
where client_updated_at is null;

alter table public.collections
  alter column client_group_id set not null,
  alter column status set default 'placed',
  alter column status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column client_updated_at set default now(),
  alter column client_updated_at set not null;

alter table public.collections
  drop constraint if exists collections_status_check;

alter table public.collections
  add constraint collections_status_check
  check (status in ('placed', 'updated', 'cancelled'));

create index if not exists collections_client_group_id_idx
on public.collections(client_group_id);

create index if not exists collections_client_updated_at_idx
on public.collections(client_updated_at desc);

-- Core collection history must not disappear when a shop is retired.
alter table public.collections
  drop constraint if exists collections_shop_id_fkey;

alter table public.collections
  add constraint collections_shop_id_fkey
  foreign key (shop_id) references public.shops(id) on delete restrict;

drop trigger if exists collections_set_updated_at on public.collections;

create trigger collections_set_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

-- No collection payload is retained here. The UUID prevents a delayed sync from
-- recreating a collection after an explicit hard delete.
create table if not exists public.deleted_collection_ids (
  collection_id uuid primary key,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_collection_ids enable row level security;
revoke all on table public.deleted_collection_ids from anon, authenticated;

create or replace function public.prevent_deleted_collection_recreation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.deleted_collection_ids deleted_collection
    where deleted_collection.collection_id = new.client_group_id
  ) then
    raise exception 'This collection was permanently deleted and cannot be recreated.';
  end if;

  return new;
end;
$$;

drop trigger if exists collections_prevent_deleted_recreation on public.collections;

create trigger collections_prevent_deleted_recreation
before insert on public.collections
for each row execute function public.prevent_deleted_collection_recreation();

-- Immutable server-side recovery ledger. Every protected client mutation writes
-- a full payload snapshot here in the same transaction as its live record.
create table if not exists public.core_data_events (
  id uuid primary key default gen_random_uuid(),
  client_mutation_id uuid not null unique,
  entity_type text not null check (entity_type in ('order', 'visit_proof', 'collection')),
  entity_id uuid not null,
  action text not null check (action in ('placed', 'updated', 'cancelled', 'recorded')),
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists core_data_events_entity_idx
on public.core_data_events(entity_type, entity_id, created_at desc);

create index if not exists core_data_events_actor_idx
on public.core_data_events(actor_id, created_at desc);

alter table public.core_data_events enable row level security;

revoke all on table public.core_data_events from anon, authenticated;
grant select on table public.core_data_events to authenticated;

drop policy if exists "core_data_events_select_admin_manager_or_owner" on public.core_data_events;

create policy "core_data_events_select_admin_manager_or_owner"
on public.core_data_events for select
to authenticated
using (public.can_view_all() or actor_id = auth.uid());

create or replace function public.delete_order_v2(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_admin() then
    raise exception 'Only an admin can permanently delete an order.';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.';
  end if;

  insert into public.deleted_order_ids (order_id, deleted_by)
  values (p_order_id, auth.uid())
  on conflict (order_id) do update
  set
    deleted_by = excluded.deleted_by,
    deleted_at = now();

  delete from public.core_data_events
  where entity_type = 'order'
    and entity_id = p_order_id;

  delete from public.orders
  where id = p_order_id;

  return true;
end;
$$;

create or replace function public.delete_collection_group_v2(p_collection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_person_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select collections.sales_person_id
  into v_sales_person_id
  from public.collections
  where collections.client_group_id = p_collection_id
    or collections.id = p_collection_id
  order by collections.created_at asc
  limit 1;

  if v_sales_person_id is null then
    insert into public.deleted_collection_ids (collection_id, deleted_by)
    values (p_collection_id, auth.uid())
    on conflict (collection_id) do update
    set
      deleted_by = excluded.deleted_by,
      deleted_at = now();

    return false;
  end if;

  if not v_is_admin and v_sales_person_id <> auth.uid() then
    raise exception 'You can only permanently delete your own collections.';
  end if;

  insert into public.deleted_collection_ids (collection_id, deleted_by)
  values (p_collection_id, auth.uid())
  on conflict (collection_id) do update
  set
    deleted_by = excluded.deleted_by,
    deleted_at = now();

  delete from public.core_data_events
  where entity_type = 'collection'
    and entity_id = p_collection_id;

  delete from public.collections
  where client_group_id = p_collection_id
    or id = p_collection_id;

  return true;
end;
$$;

create or replace function public.save_order_with_items(
  p_order jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := nullif(p_order->>'id', '')::uuid;
  v_shop_id uuid := nullif(p_order->>'shop_id', '')::uuid;
  v_sales_person_id uuid := nullif(p_order->>'sales_person_id', '')::uuid;
  v_order_type public.order_type := coalesce(nullif(p_order->>'order_type', ''), 'route')::public.order_type;
  v_order_status public.order_status := coalesce(nullif(p_order->>'status', ''), 'placed')::public.order_status;
  v_created_at timestamptz := coalesce(nullif(p_order->>'created_at', '')::timestamptz, now());
  v_client_updated_at timestamptz := coalesce(nullif(p_order->>'client_updated_at', '')::timestamptz, now());
  v_client_mutation_id uuid := coalesce(nullif(p_order->>'client_mutation_id', '')::uuid, gen_random_uuid());
  v_existing_sales_person_id uuid;
  v_existing_shop_id uuid;
  v_applied_order_id uuid;
  v_order_started_visit jsonb := p_order->'order_started_visit';
  v_visit_event_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_order_id is null or v_shop_id is null or v_sales_person_id is null then
    raise exception 'Order id, shop, and salesperson are required.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one product.';
  end if;

  if not v_is_admin and v_sales_person_id <> auth.uid() then
    raise exception 'You can only save your own orders.';
  end if;

  select sales_person_id, shop_id
  into v_existing_sales_person_id, v_existing_shop_id
  from public.orders
  where id = v_order_id;

  if not v_is_admin and v_existing_sales_person_id is not null then
    if v_existing_sales_person_id <> auth.uid() then
      raise exception 'You cannot update another salesperson''s order.';
    end if;

    if v_existing_shop_id <> v_shop_id then
      raise exception 'An existing order cannot be moved to another shop.';
    end if;
  end if;

  if not v_is_admin and v_existing_sales_person_id is null and not exists (
    select 1
    from public.shops shop
    where shop.id = v_shop_id
      and (
        shop.assigned_to = auth.uid()
        or exists (
          select 1
          from public.route_overrides route_override
          where route_override.sales_person_id = auth.uid()
            and route_override.override_date = (v_created_at at time zone 'Asia/Kolkata')::date
            and public.normalized_area_name(route_override.area) = public.normalized_area_name(shop.area)
        )
      )
  ) then
    raise exception 'This shop was not available on your route for the order date.';
  end if;

  insert into public.orders (
    id,
    shop_id,
    sales_person_id,
    sales_person_name,
    order_type,
    status,
    notes,
    replacement_notes,
    subtotal,
    gst_rate,
    gst_amount,
    grand_total,
    visit_lat,
    visit_lng,
    visit_accuracy,
    visit_captured_at,
    change_log,
    created_at,
    updated_at,
    client_updated_at
  )
  values (
    v_order_id,
    v_shop_id,
    v_sales_person_id,
    nullif(p_order->>'sales_person_name', ''),
    v_order_type,
    v_order_status,
    nullif(p_order->>'notes', ''),
    nullif(p_order->>'replacement_notes', ''),
    coalesce(nullif(p_order->>'subtotal', '')::numeric, 0),
    coalesce(nullif(p_order->>'gst_rate', '')::numeric, 0.05),
    coalesce(nullif(p_order->>'gst_amount', '')::numeric, 0),
    coalesce(nullif(p_order->>'grand_total', '')::numeric, 0),
    nullif(p_order->>'visit_lat', '')::numeric,
    nullif(p_order->>'visit_lng', '')::numeric,
    nullif(p_order->>'visit_accuracy', '')::numeric,
    nullif(p_order->>'visit_captured_at', '')::timestamptz,
    coalesce(p_order->'change_log', '[]'::jsonb),
    v_created_at,
    v_client_updated_at,
    v_client_updated_at
  )
  on conflict (id) do update
  set
    sales_person_id = excluded.sales_person_id,
    sales_person_name = excluded.sales_person_name,
    order_type = excluded.order_type,
    status = excluded.status,
    notes = excluded.notes,
    replacement_notes = excluded.replacement_notes,
    subtotal = excluded.subtotal,
    gst_rate = excluded.gst_rate,
    gst_amount = excluded.gst_amount,
    grand_total = excluded.grand_total,
    visit_lat = excluded.visit_lat,
    visit_lng = excluded.visit_lng,
    visit_accuracy = excluded.visit_accuracy,
    visit_captured_at = excluded.visit_captured_at,
    change_log = excluded.change_log,
    client_updated_at = excluded.client_updated_at
  where public.orders.client_updated_at <= excluded.client_updated_at
  returning id into v_applied_order_id;

  if v_applied_order_id is null then
    return;
  end if;

  delete from public.order_items
  where order_id = v_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    product_sku_id,
    product_name,
    sku_size,
    sku_code,
    rate,
    mrp,
    quantity
  )
  select
    v_order_id,
    case
      when nullif(item->>'product_id', '') is not null
        and exists (
          select 1
          from public.products product
          where product.id = nullif(item->>'product_id', '')::uuid
        )
      then nullif(item->>'product_id', '')::uuid
      else null
    end,
    case
      when nullif(item->>'product_sku_id', '') is not null
        and exists (
          select 1
          from public.product_skus product_sku
          where product_sku.id = nullif(item->>'product_sku_id', '')::uuid
        )
      then nullif(item->>'product_sku_id', '')::uuid
      else null
    end,
    item->>'product_name',
    coalesce(item->>'sku_size', ''),
    nullif(item->>'sku_code', ''),
    coalesce(nullif(item->>'rate', '')::numeric, 0),
    coalesce(nullif(item->>'mrp', '')::numeric, 0),
    (item->>'quantity')::integer
  from jsonb_array_elements(p_items) as item;

  if v_order_started_visit is not null and v_order_started_visit <> 'null'::jsonb then
    v_visit_event_id := nullif(v_order_started_visit->>'client_event_id', '')::uuid;

    if v_visit_event_id is null then
      raise exception 'Route order visit proof requires a client event id.';
    end if;

    if nullif(v_order_started_visit->>'latitude', '') is null
      or nullif(v_order_started_visit->>'longitude', '') is null then
      raise exception 'Route order visit proof requires GPS coordinates.';
    end if;

    insert into public.visit_proofs (
      shop_id,
      order_id,
      sales_person_id,
      latitude,
      longitude,
      accuracy,
      distance_meters,
      captured_at,
      visit_type,
      client_event_id
    )
    values (
      v_shop_id,
      v_order_id,
      v_sales_person_id,
      nullif(v_order_started_visit->>'latitude', '')::numeric,
      nullif(v_order_started_visit->>'longitude', '')::numeric,
      nullif(v_order_started_visit->>'accuracy', '')::numeric,
      nullif(v_order_started_visit->>'distance_meters', '')::integer,
      coalesce(nullif(v_order_started_visit->>'captured_at', '')::timestamptz, v_created_at),
      'order_started',
      v_visit_event_id
    )
    on conflict (client_event_id) do nothing;
  end if;

  insert into public.core_data_events (
    client_mutation_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    payload
  )
  values (
    v_client_mutation_id,
    'order',
    v_order_id,
    case when v_order_status = 'cancelled' then 'cancelled' else v_order_status::text end,
    auth.uid(),
    jsonb_build_object(
      'order', p_order - 'client_mutation_id',
      'items', p_items
    )
  )
  on conflict (client_mutation_id) do nothing;
end;
$$;

create or replace function public.sync_visit_proof(p_visit jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := nullif(p_visit->>'client_event_id', '')::uuid;
  v_shop_id uuid := nullif(p_visit->>'shop_id', '')::uuid;
  v_order_id uuid := nullif(p_visit->>'order_id', '')::uuid;
  v_sales_person_id uuid := nullif(p_visit->>'sales_person_id', '')::uuid;
  v_visit_type text := coalesce(nullif(p_visit->>'visit_type', ''), 'check_in');
  v_latitude numeric := nullif(p_visit->>'latitude', '')::numeric;
  v_longitude numeric := nullif(p_visit->>'longitude', '')::numeric;
  v_accuracy numeric := nullif(p_visit->>'accuracy', '')::numeric;
  v_distance_meters integer := nullif(p_visit->>'distance_meters', '')::integer;
  v_captured_at timestamptz := coalesce(nullif(p_visit->>'captured_at', '')::timestamptz, now());
  v_save_shop_anchor boolean := coalesce(nullif(p_visit->>'save_shop_anchor', '')::boolean, false);
  v_existing_id uuid;
  v_inserted_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_event_id is null or v_shop_id is null or v_sales_person_id is null then
    raise exception 'Visit proof event id, shop, and salesperson are required.';
  end if;

  if v_visit_type not in ('check_in', 'order_started', 'no_order') then
    raise exception 'Unsupported visit proof type.';
  end if;

  if v_latitude is null or v_longitude is null then
    raise exception 'Visit proof requires GPS coordinates.';
  end if;

  if not v_is_admin and v_sales_person_id <> auth.uid() then
    raise exception 'You can only save your own visit proofs.';
  end if;

  if v_order_id is not null and not exists (
    select 1
    from public.orders order_record
    where order_record.id = v_order_id
      and order_record.shop_id = v_shop_id
      and order_record.sales_person_id = v_sales_person_id
  ) then
    raise exception 'Visit proof order does not match the shop and salesperson.';
  end if;

  if not v_is_admin and not exists (
    select 1
    from public.shops shop
    where shop.id = v_shop_id
      and (
        shop.assigned_to = auth.uid()
        or exists (
          select 1
          from public.route_overrides route_override
          where route_override.sales_person_id = auth.uid()
            and route_override.override_date = (v_captured_at at time zone 'Asia/Kolkata')::date
            and public.normalized_area_name(route_override.area) = public.normalized_area_name(shop.area)
        )
      )
  ) then
    raise exception 'This shop was not available on your route for the visit date.';
  end if;

  select id
  into v_existing_id
  from public.visit_proofs
  where client_event_id = v_event_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if v_save_shop_anchor then
    update public.shops
    set
      location_lat = v_latitude,
      location_lng = v_longitude,
      location_accuracy = v_accuracy,
      location_captured_at = v_captured_at
    where id = v_shop_id
      and (location_lat is null or location_lng is null);
  end if;

  select id
  into v_existing_id
  from public.visit_proofs
  where shop_id = v_shop_id
    and sales_person_id = v_sales_person_id
    and visit_type = v_visit_type
    and captured_at between v_captured_at - interval '2 minutes' and v_captured_at + interval '2 minutes'
  order by captured_at asc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.visit_proofs (
    shop_id,
    order_id,
    sales_person_id,
    latitude,
    longitude,
    accuracy,
    distance_meters,
    captured_at,
    visit_type,
    client_event_id
  )
  values (
    v_shop_id,
    v_order_id,
    v_sales_person_id,
    v_latitude,
    v_longitude,
    v_accuracy,
    v_distance_meters,
    v_captured_at,
    v_visit_type,
    v_event_id
  )
  on conflict (client_event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    insert into public.core_data_events (
      client_mutation_id,
      entity_type,
      entity_id,
      action,
      actor_id,
      payload
    )
    values (
      v_event_id,
      'visit_proof',
      v_inserted_id,
      'recorded',
      auth.uid(),
      p_visit
    )
    on conflict (client_mutation_id) do nothing;

    return v_inserted_id;
  end if;

  select id
  into v_existing_id
  from public.visit_proofs
  where client_event_id = v_event_id;

  return v_existing_id;
end;
$$;

create or replace function public.save_collection_group(
  p_collection jsonb,
  p_bills jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := nullif(p_collection->>'id', '')::uuid;
  v_shop_id uuid := nullif(p_collection->>'shop_id', '')::uuid;
  v_sales_person_id uuid := nullif(p_collection->>'sales_person_id', '')::uuid;
  v_collection_type text := coalesce(nullif(p_collection->>'collection_type', ''), 'route');
  v_status text := coalesce(nullif(p_collection->>'status', ''), 'placed');
  v_created_at timestamptz := coalesce(nullif(p_collection->>'created_at', '')::timestamptz, now());
  v_client_updated_at timestamptz := coalesce(nullif(p_collection->>'client_updated_at', '')::timestamptz, now());
  v_client_mutation_id uuid := coalesce(nullif(p_collection->>'client_mutation_id', '')::uuid, gen_random_uuid());
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_group_id is null or v_shop_id is null or v_sales_person_id is null then
    raise exception 'Collection id, shop, and salesperson are required.';
  end if;

  if v_collection_type not in ('route', 'adhoc') then
    raise exception 'Unsupported collection type.';
  end if;

  if v_status not in ('placed', 'updated', 'cancelled') then
    raise exception 'Unsupported collection status.';
  end if;

  if not v_is_admin and v_sales_person_id <> auth.uid() then
    raise exception 'You can only save your own collections.';
  end if;

  if not v_is_admin and exists (
    select 1
    from public.collections
    where client_group_id = v_group_id
      and sales_person_id <> auth.uid()
  ) then
    raise exception 'You cannot update another salesperson''s collection.';
  end if;

  if v_status <> 'cancelled' and (jsonb_typeof(p_bills) <> 'array' or jsonb_array_length(p_bills) = 0) then
    raise exception 'Collection must contain at least one bill.';
  end if;

  if v_status = 'cancelled' then
    update public.collections
    set
      status = 'cancelled',
      client_updated_at = v_client_updated_at
    where client_group_id = v_group_id
      and client_updated_at <= v_client_updated_at;

    insert into public.core_data_events (
      client_mutation_id,
      entity_type,
      entity_id,
      action,
      actor_id,
      payload
    )
    values (
      v_client_mutation_id,
      'collection',
      v_group_id,
      'cancelled',
      auth.uid(),
      jsonb_build_object(
        'collection', p_collection - 'client_mutation_id',
        'bills', p_bills
      )
    )
    on conflict (client_mutation_id) do nothing;

    return;
  end if;

  update public.collections
  set
    status = 'cancelled',
    client_updated_at = v_client_updated_at
  where client_group_id = v_group_id
    and client_updated_at <= v_client_updated_at
    and not exists (
      select 1
      from jsonb_array_elements(p_bills) as bill
      where nullif(bill->>'id', '')::uuid = public.collections.id
    );

  insert into public.collections (
    id,
    client_group_id,
    shop_id,
    sales_person_id,
    collection_type,
    status,
    bill_date,
    bill_number,
    cheque_date,
    amount,
    discount,
    replacement,
    payment_mode,
    created_at,
    updated_at,
    client_updated_at
  )
  select
    nullif(bill->>'id', '')::uuid,
    v_group_id,
    v_shop_id,
    v_sales_person_id,
    v_collection_type,
    v_status,
    (bill->>'bill_date')::date,
    bill->>'bill_number',
    nullif(bill->>'cheque_date', '')::date,
    coalesce(nullif(bill->>'amount', '')::numeric, 0),
    coalesce(nullif(bill->>'discount', '')::numeric, 0),
    coalesce(nullif(bill->>'replacement', '')::numeric, 0),
    bill->>'payment_mode',
    v_created_at,
    v_client_updated_at,
    v_client_updated_at
  from jsonb_array_elements(p_bills) as bill
  on conflict (id) do update
  set
    client_group_id = excluded.client_group_id,
    shop_id = excluded.shop_id,
    sales_person_id = excluded.sales_person_id,
    collection_type = excluded.collection_type,
    status = excluded.status,
    bill_date = excluded.bill_date,
    bill_number = excluded.bill_number,
    cheque_date = excluded.cheque_date,
    amount = excluded.amount,
    discount = excluded.discount,
    replacement = excluded.replacement,
    payment_mode = excluded.payment_mode,
    client_updated_at = excluded.client_updated_at
  where public.collections.client_updated_at <= excluded.client_updated_at;

  insert into public.core_data_events (
    client_mutation_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    payload
  )
  values (
    v_client_mutation_id,
    'collection',
    v_group_id,
    v_status,
    auth.uid(),
    jsonb_build_object(
      'collection', p_collection - 'client_mutation_id',
      'bills', p_bills
    )
  )
  on conflict (client_mutation_id) do nothing;
end;
$$;

revoke all on function public.save_order_with_items(jsonb, jsonb) from public;
revoke all on function public.sync_visit_proof(jsonb) from public;
revoke all on function public.save_collection_group(jsonb, jsonb) from public;
revoke all on function public.prevent_deleted_order_recreation() from public;
revoke all on function public.delete_order_v2(uuid) from public;
revoke all on function public.prevent_deleted_collection_recreation() from public;
revoke all on function public.delete_collection_group_v2(uuid) from public;

grant execute on function public.save_order_with_items(jsonb, jsonb) to authenticated;
grant execute on function public.sync_visit_proof(jsonb) to authenticated;
grant execute on function public.save_collection_group(jsonb, jsonb) to authenticated;
grant execute on function public.delete_order_v2(uuid) to authenticated;
grant execute on function public.delete_collection_group_v2(uuid) to authenticated;

-- Cutover protection: core records are changed only through the transactional
-- functions above. This prevents a browser-side table delete from removing
-- orders, items, visit proofs, or collections.
revoke insert, update, delete on table public.orders from authenticated;
revoke insert, update, delete on table public.order_items from authenticated;
revoke insert, update, delete on table public.visit_proofs from authenticated;
revoke insert, update, delete on table public.collections from authenticated;

drop policy if exists "orders_insert_admin_or_assigned_sales" on public.orders;
drop policy if exists "orders_insert_admin_or_owner" on public.orders;
drop policy if exists "orders_update_admin_or_owner" on public.orders;
drop policy if exists "orders_delete_admin" on public.orders;

drop policy if exists "order_items_insert_admin_or_order_owner" on public.order_items;
drop policy if exists "order_items_update_admin_or_order_owner" on public.order_items;
drop policy if exists "order_items_delete_admin_or_order_owner" on public.order_items;

drop policy if exists "visit_proofs_insert_admin_or_owner" on public.visit_proofs;
drop policy if exists "visit_proofs_delete_admin" on public.visit_proofs;

drop policy if exists "collections_insert_admin_or_owner" on public.collections;
drop policy if exists "collections_update_admin_or_owner" on public.collections;
drop policy if exists "collections_delete_admin_or_owner" on public.collections;
