drop policy if exists "collections_update_admin_or_owner" on public.collections;
drop policy if exists "collections_delete_admin_or_owner" on public.collections;

create policy "collections_update_admin_or_owner"
on public.collections for update
to authenticated
using (public.is_admin() or sales_person_id = auth.uid())
with check (public.is_admin() or sales_person_id = auth.uid());

create policy "collections_delete_admin_or_owner"
on public.collections for delete
to authenticated
using (public.is_admin() or sales_person_id = auth.uid());
