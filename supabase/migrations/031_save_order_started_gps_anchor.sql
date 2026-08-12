-- Keep GPS storage compact while preserving first-time shop anchors.
-- Route order saves only one final visit proof, so the order_started/no_order
-- proof must replace the intermediate check_in proof for the same shop/day.

create or replace function public.delete_same_day_check_in_visit(
  p_shop_id uuid,
  p_sales_person_id uuid,
  p_captured_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_shop_id is null or p_sales_person_id is null or p_captured_at is null then
    return;
  end if;

  delete from public.visit_proofs
  where shop_id = p_shop_id
    and sales_person_id = p_sales_person_id
    and visit_type = 'check_in'
    and (captured_at at time zone 'Asia/Kolkata')::date = (p_captured_at at time zone 'Asia/Kolkata')::date;
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
declare
  v_order_started_visit jsonb := p_order->'order_started_visit';
  v_save_shop_anchor boolean := false;
  v_shop_id uuid := nullif(p_order->>'shop_id', '')::uuid;
  v_latitude numeric;
  v_longitude numeric;
  v_accuracy numeric;
  v_captured_at timestamptz;
begin
  perform public.validate_order_sync_guard(p_order);
  perform public.save_order_with_items(p_order, p_items);

  if v_order_started_visit is not null and v_order_started_visit <> 'null'::jsonb then
    v_save_shop_anchor := coalesce(nullif(v_order_started_visit->>'save_shop_anchor', '')::boolean, false);
    v_latitude := nullif(v_order_started_visit->>'latitude', '')::numeric;
    v_longitude := nullif(v_order_started_visit->>'longitude', '')::numeric;
    v_accuracy := nullif(v_order_started_visit->>'accuracy', '')::numeric;
    v_captured_at := coalesce(nullif(v_order_started_visit->>'captured_at', '')::timestamptz, now());

    if v_save_shop_anchor and v_shop_id is not null and v_latitude is not null and v_longitude is not null then
      update public.shops
      set
        location_lat = v_latitude,
        location_lng = v_longitude,
        location_accuracy = v_accuracy,
        location_captured_at = v_captured_at
      where id = v_shop_id
        and (location_lat is null or location_lng is null);
    end if;

    perform public.delete_same_day_check_in_visit(
      v_shop_id,
      nullif(p_order->>'sales_person_id', '')::uuid,
      v_captured_at
    );
  end if;
end;
$$;

create or replace function public.sync_visit_proof_v2(p_visit jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_id uuid;
  v_visit_type text := coalesce(nullif(p_visit->>'visit_type', ''), 'check_in');
begin
  v_visit_id := public.sync_visit_proof(p_visit);

  if v_visit_type in ('order_started', 'no_order') then
    perform public.delete_same_day_check_in_visit(
      nullif(p_visit->>'shop_id', '')::uuid,
      nullif(p_visit->>'sales_person_id', '')::uuid,
      coalesce(nullif(p_visit->>'captured_at', '')::timestamptz, now())
    );
  end if;

  return v_visit_id;
end;
$$;

revoke all on function public.delete_same_day_check_in_visit(uuid, uuid, timestamptz) from public;
revoke all on function public.save_order_with_items_v2(jsonb, jsonb) from public;
revoke all on function public.sync_visit_proof_v2(jsonb) from public;
grant execute on function public.save_order_with_items_v2(jsonb, jsonb) to authenticated;
grant execute on function public.sync_visit_proof_v2(jsonb) to authenticated;
