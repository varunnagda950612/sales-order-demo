drop policy if exists "sales_targets_admin_all" on public.sales_targets;

create policy "sales_targets_insert_admin"
on public.sales_targets for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
      and profiles.active = true
  )
);

create policy "sales_targets_update_admin"
on public.sales_targets for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
      and profiles.active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
      and profiles.active = true
  )
);

create policy "sales_targets_delete_admin"
on public.sales_targets for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
      and profiles.active = true
  )
);
