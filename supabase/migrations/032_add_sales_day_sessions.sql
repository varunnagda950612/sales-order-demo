create table if not exists public.sales_day_sessions (
  id uuid primary key default gen_random_uuid(),
  sales_person_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  lunch_started_at timestamptz,
  lunch_ended_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_person_id, work_date),
  check (status in ('active', 'on_break', 'ended')),
  check (ended_at is null or ended_at >= started_at),
  check (lunch_started_at is null or lunch_started_at >= started_at),
  check (lunch_ended_at is null or lunch_started_at is not null),
  check (lunch_ended_at is null or lunch_ended_at >= lunch_started_at)
);

create index if not exists sales_day_sessions_work_date_idx
on public.sales_day_sessions(work_date desc);

create index if not exists sales_day_sessions_sales_person_date_idx
on public.sales_day_sessions(sales_person_id, work_date desc);

drop trigger if exists sales_day_sessions_set_updated_at on public.sales_day_sessions;

create trigger sales_day_sessions_set_updated_at
before update on public.sales_day_sessions
for each row execute function public.set_updated_at();

alter table public.sales_day_sessions enable row level security;

grant select, insert, update on table public.sales_day_sessions to authenticated;

drop policy if exists "sales_day_sessions_select_admin_manager_or_owner" on public.sales_day_sessions;
drop policy if exists "sales_day_sessions_insert_owner" on public.sales_day_sessions;
drop policy if exists "sales_day_sessions_update_owner" on public.sales_day_sessions;

create policy "sales_day_sessions_select_admin_manager_or_owner"
on public.sales_day_sessions for select
to authenticated
using (
  public.can_view_all()
  or sales_person_id = auth.uid()
);

create policy "sales_day_sessions_insert_owner"
on public.sales_day_sessions for insert
to authenticated
with check (sales_person_id = auth.uid());

create policy "sales_day_sessions_update_owner"
on public.sales_day_sessions for update
to authenticated
using (sales_person_id = auth.uid())
with check (sales_person_id = auth.uid());

create or replace function public.require_sales_day_actor()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Login is required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_actor_id
      and role = 'sales'
      and active = true
  ) then
    raise exception 'Only active salespeople can update day status.';
  end if;

  return v_actor_id;
end;
$$;

create or replace function public.start_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date)
)
returns public.sales_day_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.require_sales_day_actor();
  v_session public.sales_day_sessions;
begin
  select *
  into v_session
  from public.sales_day_sessions
  where sales_person_id = v_actor_id
    and work_date = p_work_date
  for update;

  if found then
    if v_session.status = 'ended' then
      raise exception 'This work day is already ended.';
    end if;

    return v_session;
  end if;

  insert into public.sales_day_sessions (
    sales_person_id,
    work_date,
    status,
    started_at
  )
  values (
    v_actor_id,
    p_work_date,
    'active',
    now()
  )
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.start_sales_lunch_break(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date)
)
returns public.sales_day_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.require_sales_day_actor();
  v_session public.sales_day_sessions;
begin
  select *
  into v_session
  from public.sales_day_sessions
  where sales_person_id = v_actor_id
    and work_date = p_work_date
  for update;

  if not found then
    raise exception 'Start day before taking lunch break.';
  end if;

  if v_session.status = 'ended' then
    raise exception 'This work day is already ended.';
  end if;

  if v_session.status = 'on_break' then
    return v_session;
  end if;

  update public.sales_day_sessions
  set
    status = 'on_break',
    lunch_started_at = coalesce(lunch_started_at, now()),
    lunch_ended_at = null
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.resume_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date)
)
returns public.sales_day_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.require_sales_day_actor();
  v_session public.sales_day_sessions;
begin
  select *
  into v_session
  from public.sales_day_sessions
  where sales_person_id = v_actor_id
    and work_date = p_work_date
  for update;

  if not found then
    raise exception 'Start day before resuming work.';
  end if;

  if v_session.status = 'ended' then
    raise exception 'This work day is already ended.';
  end if;

  if v_session.status = 'active' then
    return v_session;
  end if;

  update public.sales_day_sessions
  set
    status = 'active',
    lunch_ended_at = now()
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.end_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date)
)
returns public.sales_day_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.require_sales_day_actor();
  v_session public.sales_day_sessions;
begin
  select *
  into v_session
  from public.sales_day_sessions
  where sales_person_id = v_actor_id
    and work_date = p_work_date
  for update;

  if not found then
    raise exception 'Start day before ending work.';
  end if;

  if v_session.status = 'ended' then
    return v_session;
  end if;

  update public.sales_day_sessions
  set
    status = 'ended',
    ended_at = now(),
    lunch_ended_at = case
      when status = 'on_break' and lunch_ended_at is null then now()
      else lunch_ended_at
    end
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.require_sales_day_actor() from public;
revoke all on function public.start_sales_day(date) from public;
revoke all on function public.start_sales_lunch_break(date) from public;
revoke all on function public.resume_sales_day(date) from public;
revoke all on function public.end_sales_day(date) from public;

grant execute on function public.start_sales_day(date) to authenticated;
grant execute on function public.start_sales_lunch_break(date) to authenticated;
grant execute on function public.resume_sales_day(date) to authenticated;
grant execute on function public.end_sales_day(date) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.sales_day_sessions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
