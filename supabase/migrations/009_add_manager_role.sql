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

drop policy if exists "profiles_select_admin_or_self" on public.profiles;
create policy "profiles_select_admin_or_self"
on public.profiles for select
to authenticated
using (public.can_view_all() or id = auth.uid());

drop policy if exists "shops_select_admin_or_assigned" on public.shops;
create policy "shops_select_admin_or_assigned"
on public.shops for select
to authenticated
using (public.can_view_all() or assigned_to = auth.uid());

drop policy if exists "orders_select_admin_or_owner" on public.orders;
create policy "orders_select_admin_or_owner"
on public.orders for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

drop policy if exists "order_items_select_admin_or_order_owner" on public.order_items;
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

drop policy if exists "visit_proofs_select_admin_or_owner" on public.visit_proofs;
create policy "visit_proofs_select_admin_or_owner"
on public.visit_proofs for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

drop policy if exists "sales_targets_select_admin_or_owner" on public.sales_targets;
create policy "sales_targets_select_admin_or_owner"
on public.sales_targets for select
to authenticated
using (public.can_view_all() or sales_person_id = auth.uid());

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs for select
to authenticated
using (public.can_view_all());
