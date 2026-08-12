create or replace function public.save_order_with_items(
  p_order jsonb,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid := (p_order->>'id')::uuid;
begin
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Order must contain at least one product.';
  end if;

  insert into public.orders (
    id,
    shop_id,
    sales_person_id,
    sales_person_name,
    order_type,
    status,
    notes,
    replacement_notes,
    subtotal,
    gst_rate,
    gst_amount,
    grand_total,
    visit_lat,
    visit_lng,
    visit_accuracy,
    visit_captured_at,
    change_log
  )
  values (
    v_order_id,
    (p_order->>'shop_id')::uuid,
    nullif(p_order->>'sales_person_id', '')::uuid,
    nullif(p_order->>'sales_person_name', ''),
    coalesce(nullif(p_order->>'order_type', ''), 'route')::public.order_type,
    coalesce(nullif(p_order->>'status', ''), 'placed')::public.order_status,
    nullif(p_order->>'notes', ''),
    nullif(p_order->>'replacement_notes', ''),
    coalesce((p_order->>'subtotal')::numeric, 0),
    coalesce((p_order->>'gst_rate')::numeric, 0.05),
    coalesce((p_order->>'gst_amount')::numeric, 0),
    coalesce((p_order->>'grand_total')::numeric, 0),
    nullif(p_order->>'visit_lat', '')::numeric,
    nullif(p_order->>'visit_lng', '')::numeric,
    nullif(p_order->>'visit_accuracy', '')::numeric,
    nullif(p_order->>'visit_captured_at', '')::timestamptz,
    coalesce(p_order->'change_log', '[]'::jsonb)
  )
  on conflict (id) do update
  set
    shop_id = excluded.shop_id,
    sales_person_id = excluded.sales_person_id,
    sales_person_name = excluded.sales_person_name,
    order_type = excluded.order_type,
    status = excluded.status,
    notes = excluded.notes,
    replacement_notes = excluded.replacement_notes,
    subtotal = excluded.subtotal,
    gst_rate = excluded.gst_rate,
    gst_amount = excluded.gst_amount,
    grand_total = excluded.grand_total,
    visit_lat = excluded.visit_lat,
    visit_lng = excluded.visit_lng,
    visit_accuracy = excluded.visit_accuracy,
    visit_captured_at = excluded.visit_captured_at,
    change_log = excluded.change_log;

  delete from public.order_items
  where order_id = v_order_id;

  insert into public.order_items (
    id,
    order_id,
    product_id,
    product_sku_id,
    product_name,
    sku_size,
    sku_code,
    rate,
    mrp,
    quantity
  )
  select
    coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid()),
    v_order_id,
    nullif(item->>'product_id', '')::uuid,
    nullif(item->>'product_sku_id', '')::uuid,
    item->>'product_name',
    coalesce(item->>'sku_size', ''),
    nullif(item->>'sku_code', ''),
    coalesce((item->>'rate')::numeric, 0),
    coalesce((item->>'mrp')::numeric, 0),
    (item->>'quantity')::integer
  from jsonb_array_elements(p_items) as item;
end;
$$;

grant execute on function public.save_order_with_items(jsonb, jsonb) to authenticated;
