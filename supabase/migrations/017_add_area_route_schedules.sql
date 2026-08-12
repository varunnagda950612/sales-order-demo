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

alter table public.area_route_schedules enable row level security;

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

do $$
begin
  begin
    alter publication supabase_realtime add table public.area_route_schedules;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;
