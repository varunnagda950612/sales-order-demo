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

drop policy if exists "shops_select_admin_or_assigned" on public.shops;

create policy "shops_select_admin_or_assigned"
on public.shops for select
to authenticated
using (
  public.can_view_all()
  or assigned_to = auth.uid()
  or public.has_today_route_override_for_area(area, auth.uid())
);
