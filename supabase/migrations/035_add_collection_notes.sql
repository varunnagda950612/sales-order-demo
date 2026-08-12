alter table public.collections
  add column if not exists notes text;

create or replace function public.save_collection_group(
  p_collection jsonb,
  p_bills jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := nullif(p_collection->>'id', '')::uuid;
  v_shop_id uuid := nullif(p_collection->>'shop_id', '')::uuid;
  v_sales_person_id uuid := nullif(p_collection->>'sales_person_id', '')::uuid;
  v_collection_type text := coalesce(nullif(p_collection->>'collection_type', ''), 'route');
  v_status text := coalesce(nullif(p_collection->>'status', ''), 'placed');
  v_created_at timestamptz := coalesce(nullif(p_collection->>'created_at', '')::timestamptz, now());
  v_client_updated_at timestamptz := coalesce(nullif(p_collection->>'client_updated_at', '')::timestamptz, now());
  v_client_mutation_id uuid := coalesce(nullif(p_collection->>'client_mutation_id', '')::uuid, gen_random_uuid());
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_group_id is null or v_shop_id is null or v_sales_person_id is null then
    raise exception 'Collection id, shop, and salesperson are required.';
  end if;

  if v_collection_type not in ('route', 'adhoc') then
    raise exception 'Unsupported collection type.';
  end if;

  if v_status not in ('placed', 'updated', 'cancelled') then
    raise exception 'Unsupported collection status.';
  end if;

  if not v_is_admin and v_sales_person_id <> auth.uid() then
    raise exception 'You can only save your own collections.';
  end if;

  if not v_is_admin and exists (
    select 1
    from public.collections
    where client_group_id = v_group_id
      and sales_person_id <> auth.uid()
  ) then
    raise exception 'You cannot update another salesperson''s collection.';
  end if;

  if v_status <> 'cancelled' and (jsonb_typeof(p_bills) <> 'array' or jsonb_array_length(p_bills) = 0) then
    raise exception 'Collection must contain at least one bill.';
  end if;

  if v_status = 'cancelled' then
    update public.collections
    set
      status = 'cancelled',
      client_updated_at = v_client_updated_at
    where client_group_id = v_group_id
      and client_updated_at <= v_client_updated_at;

    insert into public.core_data_events (
      client_mutation_id,
      entity_type,
      entity_id,
      action,
      actor_id,
      payload
    )
    values (
      v_client_mutation_id,
      'collection',
      v_group_id,
      'cancelled',
      auth.uid(),
      jsonb_build_object(
        'collection', p_collection - 'client_mutation_id',
        'bills', p_bills
      )
    )
    on conflict (client_mutation_id) do nothing;

    return;
  end if;

  update public.collections
  set
    status = 'cancelled',
    client_updated_at = v_client_updated_at
  where client_group_id = v_group_id
    and client_updated_at <= v_client_updated_at
    and not exists (
      select 1
      from jsonb_array_elements(p_bills) as bill
      where nullif(bill->>'id', '')::uuid = public.collections.id
    );

  insert into public.collections (
    id,
    client_group_id,
    shop_id,
    sales_person_id,
    collection_type,
    status,
    notes,
    bill_date,
    bill_number,
    cheque_date,
    amount,
    discount,
    replacement,
    payment_mode,
    created_at,
    updated_at,
    client_updated_at
  )
  select
    nullif(bill->>'id', '')::uuid,
    v_group_id,
    v_shop_id,
    v_sales_person_id,
    v_collection_type,
    v_status,
    nullif(trim(coalesce(bill->>'notes', '')), ''),
    (bill->>'bill_date')::date,
    bill->>'bill_number',
    nullif(bill->>'cheque_date', '')::date,
    coalesce(nullif(bill->>'amount', '')::numeric, 0),
    coalesce(nullif(bill->>'discount', '')::numeric, 0),
    coalesce(nullif(bill->>'replacement', '')::numeric, 0),
    bill->>'payment_mode',
    v_created_at,
    v_client_updated_at,
    v_client_updated_at
  from jsonb_array_elements(p_bills) as bill
  on conflict (id) do update
  set
    client_group_id = excluded.client_group_id,
    shop_id = excluded.shop_id,
    sales_person_id = excluded.sales_person_id,
    collection_type = excluded.collection_type,
    status = excluded.status,
    notes = excluded.notes,
    bill_date = excluded.bill_date,
    bill_number = excluded.bill_number,
    cheque_date = excluded.cheque_date,
    amount = excluded.amount,
    discount = excluded.discount,
    replacement = excluded.replacement,
    payment_mode = excluded.payment_mode,
    client_updated_at = excluded.client_updated_at
  where public.collections.client_updated_at <= excluded.client_updated_at;

  insert into public.core_data_events (
    client_mutation_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    payload
  )
  values (
    v_client_mutation_id,
    'collection',
    v_group_id,
    v_status,
    auth.uid(),
    jsonb_build_object(
      'collection', p_collection - 'client_mutation_id',
      'bills', p_bills
    )
  )
  on conflict (client_mutation_id) do nothing;
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

revoke all on function public.save_collection_group(jsonb, jsonb) from public;
revoke all on function public.save_collection_group_v2(jsonb, jsonb) from public;

grant execute on function public.save_collection_group(jsonb, jsonb) to authenticated;
grant execute on function public.save_collection_group_v2(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
