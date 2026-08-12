create table if not exists public.sync_recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  sales_person_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  pending_count integer not null default 0 check (pending_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_person_id, device_id)
);

create index if not exists sync_recovery_snapshots_sales_person_idx
on public.sync_recovery_snapshots(sales_person_id);

create index if not exists sync_recovery_snapshots_uploaded_at_idx
on public.sync_recovery_snapshots(uploaded_at desc);

drop trigger if exists sync_recovery_snapshots_set_updated_at on public.sync_recovery_snapshots;

create trigger sync_recovery_snapshots_set_updated_at
before update on public.sync_recovery_snapshots
for each row execute function public.set_updated_at();

alter table public.sync_recovery_snapshots enable row level security;

grant select, insert, update, delete on table public.sync_recovery_snapshots to authenticated;

drop policy if exists "sync_recovery_snapshots_select_admin_manager_or_owner" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_insert_owner" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_update_owner" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_delete_admin" on public.sync_recovery_snapshots;
drop policy if exists "sync_recovery_snapshots_delete_admin_or_owner" on public.sync_recovery_snapshots;

create policy "sync_recovery_snapshots_select_admin_manager_or_owner"
on public.sync_recovery_snapshots for select
to authenticated
using (
  public.can_view_all()
  or sales_person_id = auth.uid()
);

create policy "sync_recovery_snapshots_insert_owner"
on public.sync_recovery_snapshots for insert
to authenticated
with check (sales_person_id = auth.uid());

create policy "sync_recovery_snapshots_update_owner"
on public.sync_recovery_snapshots for update
to authenticated
using (sales_person_id = auth.uid())
with check (sales_person_id = auth.uid());

create policy "sync_recovery_snapshots_delete_admin_or_owner"
on public.sync_recovery_snapshots for delete
to authenticated
using (
  public.is_admin()
  or sales_person_id = auth.uid()
);

create or replace function public.sync_recovery_snapshot_is_synced(p_snapshot jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_entity_id uuid;
begin
  for v_payload in
    select value
    from jsonb_array_elements(coalesce(p_snapshot #> '{pending,orders}', '[]'::jsonb))
  loop
    if coalesce(v_payload->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;

    v_entity_id := (v_payload->>'id')::uuid;

    if not exists (
      select 1
      from public.orders order_record
      where order_record.id = v_entity_id
    ) then
      return false;
    end if;
  end loop;

  for v_payload in
    select value
    from jsonb_array_elements(coalesce(p_snapshot #> '{pending,collections}', '[]'::jsonb))
  loop
    if coalesce(v_payload->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;

    v_entity_id := (v_payload->>'id')::uuid;

    if not exists (
      select 1
      from public.collections collection_record
      where collection_record.client_group_id = v_entity_id
         or collection_record.id = v_entity_id
    ) then
      return false;
    end if;
  end loop;

  for v_payload in
    select value
    from jsonb_array_elements(coalesce(p_snapshot #> '{pending,visitProofs}', '[]'::jsonb))
  loop
    if coalesce(v_payload->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;

    v_entity_id := (v_payload->>'id')::uuid;

    if not exists (
      select 1
      from public.visit_proofs visit_record
      where visit_record.client_event_id = v_entity_id
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.cleanup_synced_recovery_snapshots()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  with deleted_snapshots as (
    delete from public.sync_recovery_snapshots snapshot
    using public.sync_device_health health
    where health.sales_person_id = snapshot.sales_person_id
      and health.device_id = snapshot.device_id
      and snapshot.uploaded_at < now() - interval '24 hours'
      and health.status = 'clean'
      and health.protected_count = 0
      and health.pending_count = 0
      and health.syncing_count = 0
      and health.failed_count = 0
      and health.last_seen_at >= snapshot.uploaded_at
      and (
        public.can_view_all()
        or snapshot.sales_person_id = auth.uid()
      )
      and public.sync_recovery_snapshot_is_synced(snapshot.snapshot)
    returning snapshot.id
  )
  select count(*)::integer
  into v_deleted_count
  from deleted_snapshots;

  return v_deleted_count;
end;
$$;

revoke all on function public.sync_recovery_snapshot_is_synced(jsonb) from public;
revoke all on function public.cleanup_synced_recovery_snapshots() from public;
grant execute on function public.cleanup_synced_recovery_snapshots() to authenticated;
