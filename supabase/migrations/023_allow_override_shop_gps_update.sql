drop policy if exists "shops_update_admin_or_assigned" on public.shops;

create policy "shops_update_admin_or_assigned"
on public.shops for update
to authenticated
using (
  public.can_view_all()
  or assigned_to = auth.uid()
  or public.has_today_route_override_for_area(area, auth.uid())
)
with check (
  public.can_view_all()
  or assigned_to = auth.uid()
  or public.has_today_route_override_for_area(area, auth.uid())
);
