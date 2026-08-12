create table if not exists public.sales_targets (
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

drop trigger if exists sales_targets_set_updated_at on public.sales_targets;
create trigger sales_targets_set_updated_at
before update on public.sales_targets
for each row execute function public.set_updated_at();

alter table public.sales_targets enable row level security;

create policy "sales_targets_select_admin_or_owner"
on public.sales_targets for select
to authenticated
using (public.is_admin() or sales_person_id = auth.uid());

create policy "sales_targets_admin_all"
on public.sales_targets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
