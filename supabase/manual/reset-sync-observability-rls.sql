-- Targeted RLS reset for sync visibility tables only.
-- Run this after 026_add_sync_device_health.sql and 027_add_sync_recovery_snapshots.sql.
-- It does not touch orders, order_items, collections, visit_proofs, shops, products, or targets.

begin;

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

alter table public.sync_device_health enable row level security;
alter table public.sync_recovery_snapshots enable row level security;

grant select, insert, update, delete on table public.sync_device_health to authenticated;
grant select, insert, update, delete on table public.sync_recovery_snapshots to authenticated;

drop policy if exists "sync_device_health_select_admin_manager_or_owner" on public.sync_device_health;
drop policy if exists "sync_device_health_insert_owner" on public.sync_device_health;
drop policy if exists "sync_device_health_update_owner" on public.sync_device_health;
drop policy if exists "sync_device_health_delete_admin" on public.sync_device_health;

create policy "sync_device_health_select_admin_manager_or_owner"
on public.sync_device_health for select
to authenticated
using (
  public.can_view_all()
  or sales_person_id = auth.uid()
);

create policy "sync_device_health_insert_owner"
on public.sync_device_health for insert
to authenticated
with check (sales_person_id = auth.uid());

create policy "sync_device_health_update_owner"
on public.sync_device_health for update
to authenticated
using (sales_person_id = auth.uid())
with check (sales_person_id = auth.uid());

create policy "sync_device_health_delete_admin"
on public.sync_device_health for delete
to authenticated
using (public.is_admin());

drop policy if exists "sync_recovery_snapshots_select_admin_manager_or_owner" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_insert_owner" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_update_owner" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_delete_admin" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_delete_admin_or_owner" on public.sync_recovery_snapshots;

create policy "sync_recovery_snapshots_select_admin_manager_or_owner"
on public.sync_recovery_snapshots for select
to authenticated
using (
  public.can_view_all()
  or sales_person_id = auth.uid()
);

create policy "sync_recovery_snapshots_insert_owner"
on public.sync_recovery_snapshots for insert
to authenticated
with check (sales_person_id = auth.uid());

create policy "sync_recovery_snapshots_update_owner"
on public.sync_recovery_snapshots for update
to authenticated
using (sales_person_id = auth.uid())
with check (sales_person_id = auth.uid());

create policy "sync_recovery_snapshots_delete_admin_or_owner"
on public.sync_recovery_snapshots for delete
to authenticated
using (
  public.is_admin()
  or sales_person_id = auth.uid()
);

commit;
