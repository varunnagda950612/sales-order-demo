begin;

-- Retain only the deleted UUID so delayed/offline saves cannot recreate an
-- order that an admin intentionally removed. No order content is stored here.
create table if not exists public.deleted_order_ids (
  order_id uuid primary key,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_order_ids enable row level security;
revoke all on table public.deleted_order_ids from anon, authenticated;

create or replace function public.prevent_deleted_order_recreation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.deleted_order_ids deleted_order
    where deleted_order.order_id = new.id
  ) then
    raise exception 'This order was permanently deleted and cannot be recreated.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_prevent_deleted_recreation on public.orders;

create trigger orders_prevent_deleted_recreation
before insert on public.orders
for each row execute function public.prevent_deleted_order_recreation();

create or replace function public.delete_order_v2(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_admin() then
    raise exception 'Only an admin can permanently delete an order.';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.';
  end if;

  insert into public.deleted_order_ids (order_id, deleted_by)
  values (p_order_id, auth.uid())
  on conflict (order_id) do update
  set
    deleted_by = excluded.deleted_by,
    deleted_at = now();

  delete from public.core_data_events
  where entity_type = 'order'
    and entity_id = p_order_id;

  -- order_items cascade; visit_proofs keep the visit and clear order_id.
  delete from public.orders
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.prevent_deleted_order_recreation() from public;
revoke all on function public.delete_order_v2(uuid) from public;
grant execute on function public.delete_order_v2(uuid) to authenticated;

commit;
