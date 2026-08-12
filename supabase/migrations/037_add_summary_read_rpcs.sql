-- Lightweight aggregate reads for admin/manager summary cards.
-- These functions return counts/totals only, avoiding large row payloads for
-- cards that do not need full order or collection details.

create or replace function public.get_order_summary_v1(
  p_created_at_from timestamptz default null,
  p_created_at_to timestamptz default null,
  p_sales_person_id uuid default null,
  p_area text default null
)
returns table (
  total_count bigint,
  updated_count bigint,
  adhoc_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where orders.status <> 'cancelled') as total_count,
    count(*) filter (where orders.status = 'updated') as updated_count,
    count(*) filter (
      where orders.order_type = 'adhoc'
        and orders.status <> 'cancelled'
    ) as adhoc_count
  from public.orders
  left join public.shops on shops.id = orders.shop_id
  where (p_created_at_from is null or orders.created_at >= p_created_at_from)
    and (p_created_at_to is null or orders.created_at < p_created_at_to)
    and (p_sales_person_id is null or orders.sales_person_id = p_sales_person_id)
    and (p_area is null or shops.area = p_area);
$$;

grant execute on function public.get_order_summary_v1(timestamptz, timestamptz, uuid, text)
to authenticated;

create or replace function public.get_collection_summary_v1(
  p_created_at_from timestamptz default null,
  p_created_at_to timestamptz default null,
  p_sales_person_id uuid default null,
  p_area text default null,
  p_payment_mode text default null
)
returns table (
  row_count bigint,
  cash_total numeric,
  cheque_total numeric,
  upi_total numeric,
  total_amount numeric
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where coalesce(collections.status, 'placed') <> 'cancelled') as row_count,
    coalesce(
      sum(collections.amount) filter (
        where collections.payment_mode = 'cash'
          and coalesce(collections.status, 'placed') <> 'cancelled'
      ),
      0
    ) as cash_total,
    coalesce(
      sum(collections.amount) filter (
        where collections.payment_mode = 'cheque'
          and coalesce(collections.status, 'placed') <> 'cancelled'
      ),
      0
    ) as cheque_total,
    coalesce(
      sum(collections.amount) filter (
        where collections.payment_mode = 'upi'
          and coalesce(collections.status, 'placed') <> 'cancelled'
      ),
      0
    ) as upi_total,
    coalesce(
      sum(collections.amount) filter (
        where coalesce(collections.status, 'placed') <> 'cancelled'
      ),
      0
    ) as total_amount
  from public.collections
  left join public.shops on shops.id = collections.shop_id
  where (p_created_at_from is null or collections.created_at >= p_created_at_from)
    and (p_created_at_to is null or collections.created_at < p_created_at_to)
    and (p_sales_person_id is null or collections.sales_person_id = p_sales_person_id)
    and (p_area is null or shops.area = p_area)
    and (p_payment_mode is null or collections.payment_mode = p_payment_mode);
$$;

grant execute on function public.get_collection_summary_v1(timestamptz, timestamptz, uuid, text, text)
to authenticated;

create or replace function public.get_shop_area_options_v1()
returns table (
  area text
)
language sql
stable
set search_path = public
as $$
  select distinct shops.area
  from public.shops
  where shops.area is not null
    and btrim(shops.area) <> ''
  order by shops.area;
$$;

grant execute on function public.get_shop_area_options_v1()
to authenticated;
