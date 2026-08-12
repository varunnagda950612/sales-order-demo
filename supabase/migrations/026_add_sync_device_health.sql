create table if not exists public.sync_device_health (
  id uuid primary key default gen_random_uuid(),
  sales_person_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  status text not null default 'clean',
  pending_count integer not null default 0 check (pending_count >= 0),
  syncing_count integer not null default 0 check (syncing_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  protected_count integer not null default 0 check (protected_count >= 0),
  latest_error text,
  app_version text,
  user_agent text,
  page_url text,
  last_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_person_id, device_id),
  check (status in ('clean', 'pending', 'syncing', 'failed'))
);

create index if not exists sync_device_health_sales_person_idx
on public.sync_device_health(sales_person_id);

create index if not exists sync_device_health_status_idx
on public.sync_device_health(status, last_seen_at desc);

drop trigger if exists sync_device_health_set_updated_at on public.sync_device_health;

create trigger sync_device_health_set_updated_at
before update on public.sync_device_health
for each row execute function public.set_updated_at();

alter table public.sync_device_health enable row level security;

grant select, insert, update, delete on table public.sync_device_health to authenticated;

drop policy if exists "sync_device_health_select_admin_manager_or_owner" on public.sync_device_health;
drop policy if exists "sync_device_health_insert_owner" on public.sync_device_health;
drop policy if exists "sync_device_health_update_owner" on public.sync_device_health;
drop policy if exists "sync_device_health_delete_admin" on public.sync_device_health;

create policy "sync_device_health_select_admin_manager_or_owner"
on public.sync_device_health for select
to authenticated
using (
  public.can_view_all()
  or sales_person_id = auth.uid()
);

create policy "sync_device_health_insert_owner"
on public.sync_device_health for insert
to authenticated
with check (sales_person_id = auth.uid());

create policy "sync_device_health_update_owner"
on public.sync_device_health for update
to authenticated
using (sales_person_id = auth.uid())
with check (sales_person_id = auth.uid());

create policy "sync_device_health_delete_admin"
on public.sync_device_health for delete
to authenticated
using (public.is_admin());

do $$
begin
  begin
    alter publication supabase_realtime add table public.sync_device_health;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
