-- Server-side safety guard for protected order sync.
-- Prevents stale mobile/PWA queues from uploading orders with old GPS proofs
-- or duplicate same-day orders for the same salesperson and shop.

create or replace function public.validate_order_sync_guard(p_order jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := nullif(p_order->>'id', '')::uuid;
  v_shop_id uuid := nullif(p_order->>'shop_id', '')::uuid;
  v_sales_person_id uuid := nullif(p_order->>'sales_person_id', '')::uuid;
  v_order_status public.order_status := coalesce(nullif(p_order->>'status', ''), 'placed')::public.order_status;
  v_created_at timestamptz := coalesce(nullif(p_order->>'created_at', '')::timestamptz, now());
  v_visit_captured_at timestamptz := nullif(p_order->>'visit_captured_at', '')::timestamptz;
  v_existing_order_id uuid;
begin
  if v_order_status <> 'placed' then
    return;
  end if;

  if v_order_id is null or v_shop_id is null or v_sales_person_id is null then
    return;
  end if;

  if v_visit_captured_at is null
    or (v_visit_captured_at at time zone 'Asia/Kolkata')::date <> (v_created_at at time zone 'Asia/Kolkata')::date then
    raise exception 'Orders require a same-day GPS visit. Please capture the shop location again before saving this order.';
  end if;

  select orders.id
  into v_existing_order_id
  from public.orders
  where orders.id <> v_order_id
    and orders.shop_id = v_shop_id
    and orders.sales_person_id = v_sales_person_id
    and orders.status <> 'cancelled'
    and (orders.created_at at time zone 'Asia/Kolkata')::date = (v_created_at at time zone 'Asia/Kolkata')::date
  limit 1;

  if v_existing_order_id is not null then
    raise exception 'This shop already has an order for this salesperson today. Edit the existing order instead of creating another one.';
  end if;
end;
$$;

create or replace function public.save_order_with_items_v2(
  p_order jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validate_order_sync_guard(p_order);
  perform public.save_order_with_items(p_order, p_items);
end;
$$;

revoke all on function public.validate_order_sync_guard(jsonb) from public;
revoke all on function public.save_order_with_items_v2(jsonb, jsonb) from public;

grant execute on function public.save_order_with_items_v2(jsonb, jsonb) to authenticated;
