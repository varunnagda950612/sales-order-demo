-- Production RLS and order-sync patch for Manish Masala Sales Order App.
-- Safe to run on the live database: this does not delete app data.
-- It refreshes app policies, enables manager read access, and creates the
-- atomic order + order-items save function used by the production app.

alter type public.app_role add value if not exists 'manager';

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

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.product_skus enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.visit_proofs enable row level security;
alter table public.sales_targets enable row level security;
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

drop policy if exists "orders_select_admin_or_owner" on public.orders;
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

drop policy if exists "sales_targets_select_admin_or_owner" on public.sales_targets;
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
using (public.is_admin());

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
    'sales_targets'
  ];
begin
  foreach table_name in array realtime_tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
