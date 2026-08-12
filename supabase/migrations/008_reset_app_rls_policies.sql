-- Canonical production RLS policy reset for Manish Masala Sales Order App.
-- Run this when live Supabase policies drift from the app's current behavior.

alter type public.app_role add value if not exists 'manager';

alter table public.profiles
  add column if not exists geofence_meters integer not null default 100;

alter table public.profiles
  drop constraint if exists profiles_geofence_meters_range;

alter table public.profiles
  add constraint profiles_geofence_meters_range
  check (geofence_meters between 10 and 1000);

create table if not exists public.route_overrides (
  id uuid primary key default gen_random_uuid(),
  sales_person_id uuid not null references public.profiles(id) on delete cascade,
  override_date date not null,
  area text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (sales_person_id, override_date, area)
);

create table if not exists public.area_route_schedules (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  sales_person_id uuid references public.profiles(id) on delete cascade,
  visit_day text not null check (
    visit_day in ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')
  ),
  frequency text not null default 'weekly' check (frequency in ('weekly', 'biweekly')),
  start_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists area_route_schedules_area_salesperson_unique
on public.area_route_schedules (
  lower(area),
  coalesce(sales_person_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

drop trigger if exists area_route_schedules_set_updated_at on public.area_route_schedules;
create trigger area_route_schedules_set_updated_at
before update on public.area_route_schedules
for each row execute function public.set_updated_at();

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sales_person_id uuid not null references public.profiles(id) on delete restrict,
  collection_type text not null default 'route' check (collection_type in ('route', 'adhoc')),
  bill_date date not null,
  bill_number text not null,
  cheque_date date,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  replacement numeric(12, 2) not null default 0 check (replacement >= 0),
  payment_mode text not null check (payment_mode in ('cash', 'cheque', 'upi')),
  created_at timestamptz not null default now()
);

alter table public.visit_proofs
  add column if not exists visit_type text not null default 'check_in';

alter table public.visit_proofs
  drop constraint if exists visit_proofs_visit_type_check;

alter table public.visit_proofs
  add constraint visit_proofs_visit_type_check
  check (visit_type in ('check_in', 'order_started', 'no_order'));

alter table public.collections
  add column if not exists collection_type text not null default 'route';

alter table public.collections
  add column if not exists cheque_date date;

alter table public.collections
  drop constraint if exists collections_collection_type_check;

alter table public.collections
  add constraint collections_collection_type_check
  check (collection_type in ('route', 'adhoc'));

create index if not exists collections_sales_person_id_idx on public.collections(sales_person_id);
create index if not exists collections_shop_id_idx on public.collections(shop_id);
create index if not exists collections_created_at_idx on public.collections(created_at);
create index if not exists collections_bill_date_idx on public.collections(bill_date);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text = 'admin'
      and active = true
  );
$$;

create or replace function public.can_view_all()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'manager')
      and active = true
  );
$$;

create or replace function public.normalized_area_name(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.has_today_route_override_for_area(
  p_area text,
  p_sales_person_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_overrides
    where sales_person_id = p_sales_person_id
      and override_date = (now() at time zone 'Asia/Kolkata')::date
      and public.normalized_area_name(area) = public.normalized_area_name(p_area)
  );
$$;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.product_skus enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.visit_proofs enable row level security;
alter table public.collections enable row level security;
alter table public.sales_targets enable row level security;
alter table public.route_overrides enable row level security;
alter table public.area_route_schedules enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_admin_or_self" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

create policy "profiles_select_admin_or_self"
on public.profiles for select
to authenticated
using (public.can_view_all() or id = auth.uid());

create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "shops_select_admin_or_assigned" on public.shops;
drop policy if exists "shops_insert_admin_or_self_assigned" on public.shops;
drop policy if exists "shops_update_admin_or_assigned" on public.shops;
drop policy if exists "shops_delete_admin" on public.shops;

create policy "shops_select_admin_or_assigned"
on public.shops for select
to authenticated
using (
  public.can_view_all()
  or assigned_to = auth.uid()
  or public.has_today_route_override_for_area(area, auth.uid())
);

create policy "shops_insert_admin_or_self_assigned"
on public.shops for insert
to authenticated
with check (public.is_admin() or assigned_to = auth.uid());

create policy "shops_update_admin_or_assigned"
on public.shops for update
to authenticated
using (public.is_admin() or assigned_to = auth.uid())
with check (public.is_admin() or assigned_to = auth.uid());

create policy "shops_delete_admin"
on public.shops for delete
to authenticated
using (public.is_admin());

drop policy if exists "products_select_authenticated" on public.products;
drop policy if exists "products_admin_all" on public.products;
drop policy if exists "products_insert_admin" on public.products;
drop policy if exists "products_update_admin" on public.products;
drop policy if exists "products_delete_admin" on public.products;

create policy "products_select_authenticated"
on public.products for select
to authenticated
using (true);

create policy "products_insert_admin"
on public.products for insert
to authenticated
with check (public.is_admin());

create policy "products_update_admin"
on public.products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "products_delete_admin"
on public.products for delete
to authenticated
using (public.is_admin());

drop policy if exists "product_skus_select_authenticated" on public.product_skus;
drop policy if exists "product_skus_admin_all" on public.product_skus;
drop policy if exists "product_skus_insert_admin" on public.product_skus;
drop policy if exists "product_skus_update_admin" on public.product_skus;
drop policy if exists "product_skus_delete_admin" on public.product_skus;

create policy "product_skus_select_authenticated"
on public.product_skus for select
to authenticated
using (true);

create policy "product_skus_insert_admin"
on public.product_skus for insert
to authenticated
with check (public.is_admin());

create policy "product_skus_update_admin"
on public.product_skus for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "product_skus_delete_admin"
on public.product_skus for delete
to authenticated
using (public.is_admin());

drop policy if exists "orders_select_admin_or_owner" on public.orders;
drop policy if exists "orders_insert_admin_or_assigned_sales" on public.orders;
drop policy if exists "orders_insert_admin_or_owner" on public.orders;
drop policy if exists "orders_update_admin_or_owner" on public.orders;
drop policy if exists "orders_delete_admin" on public.orders;

create policy "orders_select_admin_or_owner"
on public.orders for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

create policy "orders_insert_admin_or_owner"
on public.orders for insert
to authenticated
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "orders_update_admin_or_owner"
on public.orders for update
to authenticated
using (public.is_admin() or sales_person_id = auth.uid())
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "orders_delete_admin"
on public.orders for delete
to authenticated
using (public.is_admin());

drop policy if exists "order_items_select_admin_or_order_owner" on public.order_items;
drop policy if exists "order_items_insert_admin_or_order_owner" on public.order_items;
drop policy if exists "order_items_update_admin_or_order_owner" on public.order_items;
drop policy if exists "order_items_delete_admin_or_order_owner" on public.order_items;

create policy "order_items_select_admin_or_order_owner"
on public.order_items for select
to authenticated
using (
  public.can_view_all()
  or exists (
    select 1
    from public.orders
    where orders.id = order_id
      and orders.sales_person_id = auth.uid()
  )
);

create policy "order_items_insert_admin_or_order_owner"
on public.order_items for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.orders
    where orders.id = order_id
      and orders.sales_person_id = auth.uid()
  )
);

create policy "order_items_update_admin_or_order_owner"
on public.order_items for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.orders
    where orders.id = order_id
      and orders.sales_person_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.orders
    where orders.id = order_id
      and orders.sales_person_id = auth.uid()
  )
);

create policy "order_items_delete_admin_or_order_owner"
on public.order_items for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.orders
    where orders.id = order_id
      and orders.sales_person_id = auth.uid()
  )
);

drop policy if exists "visit_proofs_select_admin_or_owner" on public.visit_proofs;
drop policy if exists "visit_proofs_insert_admin_or_owner" on public.visit_proofs;
drop policy if exists "visit_proofs_delete_admin" on public.visit_proofs;

create policy "visit_proofs_select_admin_or_owner"
on public.visit_proofs for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

create policy "visit_proofs_insert_admin_or_owner"
on public.visit_proofs for insert
to authenticated
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "visit_proofs_delete_admin"
on public.visit_proofs for delete
to authenticated
using (public.is_admin());

drop policy if exists "collections_select_admin_manager_or_owner" on public.collections;
drop policy if exists "collections_insert_admin_or_owner" on public.collections;
drop policy if exists "collections_update_admin_or_owner" on public.collections;
drop policy if exists "collections_delete_admin_or_owner" on public.collections;

create policy "collections_select_admin_manager_or_owner"
on public.collections for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

create policy "collections_insert_admin_or_owner"
on public.collections for insert
to authenticated
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "collections_update_admin_or_owner"
on public.collections for update
to authenticated
using (public.is_admin() or sales_person_id = auth.uid())
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "collections_delete_admin_or_owner"
on public.collections for delete
to authenticated
using (public.is_admin() or sales_person_id = auth.uid());

drop policy if exists "sales_targets_select_admin_or_owner" on public.sales_targets;
drop policy if exists "sales_targets_admin_all" on public.sales_targets;
drop policy if exists "sales_targets_insert_admin" on public.sales_targets;
drop policy if exists "sales_targets_update_admin" on public.sales_targets;
drop policy if exists "sales_targets_delete_admin" on public.sales_targets;

create policy "sales_targets_select_admin_or_owner"
on public.sales_targets for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

create policy "sales_targets_insert_admin"
on public.sales_targets for insert
to authenticated
with check (public.is_admin());

create policy "sales_targets_update_admin"
on public.sales_targets for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "sales_targets_delete_admin"
on public.sales_targets for delete
to authenticated
using (public.can_view_all());

drop policy if exists "route_overrides_select_admin_or_owner" on public.route_overrides;
drop policy if exists "route_overrides_insert_admin" on public.route_overrides;
drop policy if exists "route_overrides_update_admin" on public.route_overrides;
drop policy if exists "route_overrides_delete_admin" on public.route_overrides;

create policy "route_overrides_select_admin_or_owner"
on public.route_overrides for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

create policy "route_overrides_insert_admin"
on public.route_overrides for insert
to authenticated
with check (public.is_admin());

create policy "route_overrides_update_admin"
on public.route_overrides for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "route_overrides_delete_admin"
on public.route_overrides for delete
to authenticated
using (public.is_admin());

drop policy if exists "area_route_schedules_select_authenticated" on public.area_route_schedules;
drop policy if exists "area_route_schedules_insert_admin" on public.area_route_schedules;
drop policy if exists "area_route_schedules_update_admin" on public.area_route_schedules;
drop policy if exists "area_route_schedules_delete_admin" on public.area_route_schedules;

create policy "area_route_schedules_select_authenticated"
on public.area_route_schedules for select
to authenticated
using (
  public.can_view_all()
  or sales_person_id is null
  or sales_person_id = auth.uid()
);

create policy "area_route_schedules_insert_admin"
on public.area_route_schedules for insert
to authenticated
with check (public.is_admin());

create policy "area_route_schedules_update_admin"
on public.area_route_schedules for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "area_route_schedules_delete_admin"
on public.area_route_schedules for delete
to authenticated
using (public.is_admin());

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;

create policy "audit_logs_select_admin"
on public.audit_logs for select
to authenticated
using (public.is_admin());

create policy "audit_logs_insert_authenticated"
on public.audit_logs for insert
to authenticated
with check (changed_by = auth.uid() or public.is_admin());

create or replace function public.save_order_with_items(
  p_order jsonb,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid := (p_order->>'id')::uuid;
begin
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Order must contain at least one product.';
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
    change_log
  )
  values (
    v_order_id,
    (p_order->>'shop_id')::uuid,
    nullif(p_order->>'sales_person_id', '')::uuid,
    nullif(p_order->>'sales_person_name', ''),
    coalesce(nullif(p_order->>'order_type', ''), 'route')::public.order_type,
    coalesce(nullif(p_order->>'status', ''), 'placed')::public.order_status,
    nullif(p_order->>'notes', ''),
    nullif(p_order->>'replacement_notes', ''),
    coalesce((p_order->>'subtotal')::numeric, 0),
    coalesce((p_order->>'gst_rate')::numeric, 0.05),
    coalesce((p_order->>'gst_amount')::numeric, 0),
    coalesce((p_order->>'grand_total')::numeric, 0),
    nullif(p_order->>'visit_lat', '')::numeric,
    nullif(p_order->>'visit_lng', '')::numeric,
    nullif(p_order->>'visit_accuracy', '')::numeric,
    nullif(p_order->>'visit_captured_at', '')::timestamptz,
    coalesce(p_order->'change_log', '[]'::jsonb)
  )
  on conflict (id) do update
  set
    shop_id = excluded.shop_id,
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
    change_log = excluded.change_log;

  delete from public.order_items
  where order_id = v_order_id;

  insert into public.order_items (
    id,
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
    coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid()),
    v_order_id,
    nullif(item->>'product_id', '')::uuid,
    nullif(item->>'product_sku_id', '')::uuid,
    item->>'product_name',
    coalesce(item->>'sku_size', ''),
    nullif(item->>'sku_code', ''),
    coalesce((item->>'rate')::numeric, 0),
    coalesce((item->>'mrp')::numeric, 0),
    (item->>'quantity')::integer
  from jsonb_array_elements(p_items) as item;
end;
$$;

grant execute on function public.save_order_with_items(jsonb, jsonb) to authenticated;

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'profiles',
    'shops',
    'products',
    'product_skus',
    'orders',
    'order_items',
    'visit_proofs',
    'collections',
    'sales_targets',
    'route_overrides',
    'area_route_schedules'
  ];
begin
  foreach table_name in array realtime_tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then
        null;
      when undefined_object then
        null;
    end;
  end loop;
end $$;
