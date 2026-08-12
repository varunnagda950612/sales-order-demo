alter table public.sales_day_sessions
  add column if not exists start_lat double precision,
  add column if not exists start_lng double precision,
  add column if not exists start_accuracy double precision,
  add column if not exists lunch_start_lat double precision,
  add column if not exists lunch_start_lng double precision,
  add column if not exists lunch_start_accuracy double precision,
  add column if not exists lunch_end_lat double precision,
  add column if not exists lunch_end_lng double precision,
  add column if not exists lunch_end_accuracy double precision,
  add column if not exists end_lat double precision,
  add column if not exists end_lng double precision,
  add column if not exists end_accuracy double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_start_lat_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_start_lat_range
      check (start_lat is null or start_lat between -90 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_start_lng_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_start_lng_range
      check (start_lng is null or start_lng between -180 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_lunch_start_lat_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_lunch_start_lat_range
      check (lunch_start_lat is null or lunch_start_lat between -90 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_lunch_start_lng_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_lunch_start_lng_range
      check (lunch_start_lng is null or lunch_start_lng between -180 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_lunch_end_lat_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_lunch_end_lat_range
      check (lunch_end_lat is null or lunch_end_lat between -90 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_lunch_end_lng_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_lunch_end_lng_range
      check (lunch_end_lng is null or lunch_end_lng between -180 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_end_lat_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_end_lat_range
      check (end_lat is null or end_lat between -90 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_day_sessions_end_lng_range'
      and conrelid = 'public.sales_day_sessions'::regclass
  ) then
    alter table public.sales_day_sessions
      add constraint sales_day_sessions_end_lng_range
      check (end_lng is null or end_lng between -180 and 180);
  end if;
end $$;

drop function if exists public.start_sales_day(date);
drop function if exists public.start_sales_lunch_break(date);
drop function if exists public.resume_sales_day(date);
drop function if exists public.end_sales_day(date);

create or replace function public.start_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date),
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
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
    started_at,
    start_lat,
    start_lng,
    start_accuracy
  )
  values (
    v_actor_id,
    p_work_date,
    'active',
    now(),
    p_lat,
    p_lng,
    p_accuracy
  )
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.start_sales_lunch_break(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date),
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
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
    lunch_start_lat = coalesce(lunch_start_lat, p_lat),
    lunch_start_lng = coalesce(lunch_start_lng, p_lng),
    lunch_start_accuracy = coalesce(lunch_start_accuracy, p_accuracy),
    lunch_ended_at = null,
    lunch_end_lat = null,
    lunch_end_lng = null,
    lunch_end_accuracy = null
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.resume_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date),
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
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
    lunch_ended_at = now(),
    lunch_end_lat = p_lat,
    lunch_end_lng = p_lng,
    lunch_end_accuracy = p_accuracy
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.end_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date),
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
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
    end_lat = p_lat,
    end_lng = p_lng,
    end_accuracy = p_accuracy,
    lunch_ended_at = case
      when status = 'on_break' and lunch_ended_at is null then now()
      else lunch_ended_at
    end,
    lunch_end_lat = case
      when status = 'on_break' and lunch_ended_at is null then p_lat
      else lunch_end_lat
    end,
    lunch_end_lng = case
      when status = 'on_break' and lunch_ended_at is null then p_lng
      else lunch_end_lng
    end,
    lunch_end_accuracy = case
      when status = 'on_break' and lunch_ended_at is null then p_accuracy
      else lunch_end_accuracy
    end
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.reopen_sales_day(
  p_work_date date default ((now() at time zone 'Asia/Kolkata')::date)
)
returns public.sales_day_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.require_sales_day_actor();
  v_today date := ((now() at time zone 'Asia/Kolkata')::date);
  v_session public.sales_day_sessions;
begin
  if p_work_date <> v_today then
    raise exception 'Only today''s ended day can be reopened.';
  end if;

  select *
  into v_session
  from public.sales_day_sessions
  where sales_person_id = v_actor_id
    and work_date = p_work_date
  for update;

  if not found then
    raise exception 'Start day before reopening work.';
  end if;

  if v_session.status <> 'ended' then
    return v_session;
  end if;

  update public.sales_day_sessions
  set
    status = 'active',
    ended_at = null,
    end_lat = null,
    end_lng = null,
    end_accuracy = null,
    lunch_ended_at = case
      when lunch_started_at is not null and lunch_ended_at is null then now()
      else lunch_ended_at
    end
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.start_sales_day(date, double precision, double precision, double precision) from public;
revoke all on function public.start_sales_lunch_break(date, double precision, double precision, double precision) from public;
revoke all on function public.resume_sales_day(date, double precision, double precision, double precision) from public;
revoke all on function public.end_sales_day(date, double precision, double precision, double precision) from public;
revoke all on function public.reopen_sales_day(date) from public;

grant execute on function public.start_sales_day(date, double precision, double precision, double precision) to authenticated;
grant execute on function public.start_sales_lunch_break(date, double precision, double precision, double precision) to authenticated;
grant execute on function public.resume_sales_day(date, double precision, double precision, double precision) to authenticated;
grant execute on function public.end_sales_day(date, double precision, double precision, double precision) to authenticated;
grant execute on function public.reopen_sales_day(date) to authenticated;

notify pgrst, 'reload schema';
