-- Compatibility aliases for the protected core sync client.
-- The app calls the v2 names; these wrappers keep a database that has
-- 025_core_data_idempotent_sync.sql but not the manual v2 script working.

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
  perform public.save_order_with_items(p_order, p_items);
end;
$$;

create or replace function public.sync_visit_proof_v2(p_visit jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.sync_visit_proof(p_visit);
end;
$$;

create or replace function public.save_collection_group_v2(
  p_collection jsonb,
  p_bills jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.save_collection_group(p_collection, p_bills);
end;
$$;

revoke all on function public.save_order_with_items_v2(jsonb, jsonb) from public;
revoke all on function public.sync_visit_proof_v2(jsonb) from public;
revoke all on function public.save_collection_group_v2(jsonb, jsonb) from public;

grant execute on function public.save_order_with_items_v2(jsonb, jsonb) to authenticated;
grant execute on function public.sync_visit_proof_v2(jsonb) to authenticated;
grant execute on function public.save_collection_group_v2(jsonb, jsonb) to authenticated;
