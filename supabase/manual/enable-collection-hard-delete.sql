-- Permanent collection delete for the rebuilt app.
-- Retain only the deleted collection group UUID so delayed/offline saves cannot
-- recreate a collection after an explicit user delete.
alter table public.collections
  add column if not exists client_group_id uuid default gen_random_uuid();

update public.collections
set client_group_id = id
where client_group_id is null;

alter table public.collections
  alter column client_group_id set default gen_random_uuid();

create table if not exists public.deleted_collection_ids (
  collection_id uuid primary key,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_collection_ids enable row level security;
revoke all on table public.deleted_collection_ids from anon, authenticated;

create or replace function public.prevent_deleted_collection_recreation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.deleted_collection_ids deleted_collection
    where deleted_collection.collection_id = new.client_group_id
  ) then
    raise exception 'This collection was permanently deleted and cannot be recreated.';
  end if;

  return new;
end;
$$;

drop trigger if exists collections_prevent_deleted_recreation on public.collections;

create trigger collections_prevent_deleted_recreation
before insert on public.collections
for each row execute function public.prevent_deleted_collection_recreation();

create or replace function public.delete_collection_group_v2(p_collection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_person_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select collections.sales_person_id
  into v_sales_person_id
  from public.collections
  where collections.client_group_id = p_collection_id
    or collections.id = p_collection_id
  order by collections.created_at asc
  limit 1;

  if v_sales_person_id is null then
    insert into public.deleted_collection_ids (collection_id, deleted_by)
    values (p_collection_id, auth.uid())
    on conflict (collection_id) do update
    set
      deleted_by = excluded.deleted_by,
      deleted_at = now();

    return false;
  end if;

  if not v_is_admin and v_sales_person_id <> auth.uid() then
    raise exception 'You can only permanently delete your own collections.';
  end if;

  insert into public.deleted_collection_ids (collection_id, deleted_by)
  values (p_collection_id, auth.uid())
  on conflict (collection_id) do update
  set
    deleted_by = excluded.deleted_by,
    deleted_at = now();

  delete from public.core_data_events
  where entity_type = 'collection'
    and entity_id = p_collection_id;

  delete from public.collections
  where client_group_id = p_collection_id
    or id = p_collection_id;

  return true;
end;
$$;

revoke all on function public.prevent_deleted_collection_recreation() from public;
revoke all on function public.delete_collection_group_v2(uuid) from public;
grant execute on function public.delete_collection_group_v2(uuid) to authenticated;
