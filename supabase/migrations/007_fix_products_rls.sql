drop policy if exists "products_admin_all" on public.products;
drop policy if exists "product_skus_admin_all" on public.product_skus;

create policy "products_insert_admin"
on public.products for insert
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

create policy "products_update_admin"
on public.products for update
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

create policy "products_delete_admin"
on public.products for delete
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

create policy "product_skus_insert_admin"
on public.product_skus for insert
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

create policy "product_skus_update_admin"
on public.product_skus for update
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

create policy "product_skus_delete_admin"
on public.product_skus for delete
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
