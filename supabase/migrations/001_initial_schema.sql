create type public.app_role as enum ('admin', 'sales');
create type public.order_status as enum ('placed', 'updated', 'cancelled');
create type public.order_type as enum ('route', 'adhoc');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'sales',
  login_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner text,
  phone text,
  address text,
  area text,
  visit_day text check (
    visit_day is null
    or visit_day in ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'as_required')
  ),
  assigned_to uuid references public.profiles(id),
  location_lat numeric(10, 7),
  location_lng numeric(10, 7),
  location_accuracy numeric(10, 2),
  location_captured_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku_size text not null,
  sku_code text,
  rate numeric(12, 2) not null default 0,
  mrp numeric(12, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, sku_size)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  sales_person_id uuid references public.profiles(id),
  sales_person_name text,
  order_type public.order_type not null default 'route',
  status public.order_status not null default 'placed',
  notes text,
  replacement_notes text,
  subtotal numeric(12, 2) not null default 0,
  gst_rate numeric(5, 4) not null default 0.05,
  gst_amount numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  visit_lat numeric(10, 7),
  visit_lng numeric(10, 7),
  visit_accuracy numeric(10, 2),
  visit_captured_at timestamptz,
  change_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_sku_id uuid references public.product_skus(id),
  product_name text not null,
  sku_size text not null,
  sku_code text,
  rate numeric(12, 2) not null default 0,
  mrp numeric(12, 2) not null default 0,
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) generated always as (rate * quantity) stored,
  created_at timestamptz not null default now()
);

create table public.visit_proofs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  order_id uuid references public.orders(id) on delete set null,
  sales_person_id uuid references public.profiles(id),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  accuracy numeric(10, 2),
  distance_meters integer,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  sales_person_id uuid not null references public.profiles(id),
  product_id uuid references public.products(id),
  product_sku_id uuid references public.product_skus(id),
  product_name text not null,
  sku_size text not null,
  sku_code text,
  grams numeric(12, 2) not null default 0,
  target_kg numeric(12, 2) not null check (target_kg > 0),
  start_date date not null,
  end_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  changed_by uuid references public.profiles(id),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger shops_set_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger product_skus_set_updated_at
before update on public.product_skus
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger sales_targets_set_updated_at
before update on public.sales_targets
for each row execute function public.set_updated_at();

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
      and role = 'admin'
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

create policy "profiles_select_admin_or_self"
on public.profiles for select
to authenticated
using (public.is_admin() or id = auth.uid());

create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "shops_select_admin_or_assigned"
on public.shops for select
to authenticated
using (public.is_admin() or assigned_to = auth.uid());

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

create policy "products_select_authenticated"
on public.products for select
to authenticated
using (true);

create policy "products_admin_all"
on public.products for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "product_skus_select_authenticated"
on public.product_skus for select
to authenticated
using (true);

create policy "product_skus_admin_all"
on public.product_skus for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "orders_select_admin_or_owner"
on public.orders for select
to authenticated
using (public.is_admin() or sales_person_id = auth.uid());

create policy "orders_insert_admin_or_assigned_sales"
on public.orders for insert
to authenticated
with check (
  public.is_admin()
  or (
    sales_person_id = auth.uid()
    and exists (
      select 1
      from public.shops
      where shops.id = shop_id
        and shops.assigned_to = auth.uid()
    )
  )
);

create policy "orders_update_admin_or_owner"
on public.orders for update
to authenticated
using (public.is_admin() or sales_person_id = auth.uid())
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "orders_delete_admin"
on public.orders for delete
to authenticated
using (public.is_admin());

create policy "order_items_select_admin_or_order_owner"
on public.order_items for select
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

create policy "visit_proofs_select_admin_or_owner"
on public.visit_proofs for select
to authenticated
using (public.is_admin() or sales_person_id = auth.uid());

create policy "visit_proofs_insert_admin_or_owner"
on public.visit_proofs for insert
to authenticated
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "visit_proofs_delete_admin"
on public.visit_proofs for delete
to authenticated
using (public.is_admin());

create policy "sales_targets_select_admin_or_owner"
on public.sales_targets for select
to authenticated
using (public.is_admin() or sales_person_id = auth.uid());

create policy "sales_targets_admin_all"
on public.sales_targets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "audit_logs_select_admin"
on public.audit_logs for select
to authenticated
using (public.is_admin());

create policy "audit_logs_insert_authenticated"
on public.audit_logs for insert
to authenticated
with check (changed_by = auth.uid() or public.is_admin());
