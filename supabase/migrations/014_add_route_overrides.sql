create table if not exists public.route_overrides (
  id uuid primary key default gen_random_uuid(),
  sales_person_id uuid not null references public.profiles(id) on delete cascade,
  override_date date not null,
  area text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (sales_person_id, override_date, area)
);

alter table public.route_overrides enable row level security;

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

do $$
begin
  begin
    alter publication supabase_realtime add table public.route_overrides;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;
