create unique index if not exists shops_normalized_name_unique
on public.shops (
  lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
);

create or replace function public.shop_name_exists(p_shop_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized_input as (
    select lower(btrim(regexp_replace(coalesce(p_shop_name, ''), '\s+', ' ', 'g'))) as name
  )
  select normalized_input.name <> '' and exists (
    select 1
    from public.shops
    where lower(btrim(regexp_replace(shops.name, '\s+', ' ', 'g'))) = normalized_input.name
  )
  from normalized_input;
$$;

revoke all on function public.shop_name_exists(text) from public;
grant execute on function public.shop_name_exists(text) to authenticated;
