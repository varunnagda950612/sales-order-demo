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

create index if not exists collections_sales_person_id_idx on public.collections(sales_person_id);
create index if not exists collections_shop_id_idx on public.collections(shop_id);
create index if not exists collections_created_at_idx on public.collections(created_at);
create index if not exists collections_bill_date_idx on public.collections(bill_date);

alter table public.collections enable row level security;

drop policy if exists "collections_select_admin_manager_or_owner" on public.collections;
drop policy if exists "collections_insert_admin_or_owner" on public.collections;
drop policy if exists "collections_update_admin_or_owner" on public.collections;
drop policy if exists "collections_delete_admin_or_owner" on public.collections;

create policy "collections_select_admin_manager_or_owner"
on public.collections for select
using (
  public.can_view_all()
  or sales_person_id = auth.uid()
);

create policy "collections_insert_admin_or_owner"
on public.collections for insert
with check (
  public.is_admin()
  or sales_person_id = auth.uid()
);

create policy "collections_update_admin_or_owner"
on public.collections for update
using (
  public.is_admin()
  or sales_person_id = auth.uid()
)
with check (
  public.is_admin()
  or sales_person_id = auth.uid()
);

create policy "collections_delete_admin_or_owner"
on public.collections for delete
using (
  public.is_admin()
  or sales_person_id = auth.uid()
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.collections;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
