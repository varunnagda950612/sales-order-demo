drop policy if exists "orders_insert_admin_or_assigned_sales" on public.orders;

create policy "orders_insert_admin_or_owner"
on public.orders for insert
to authenticated
with check (
  public.is_admin()
  or sales_person_id = auth.uid()
);
