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
    lunch_ended_at = case
      when lunch_started_at is not null and lunch_ended_at is null then now()
      else lunch_ended_at
    end
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.reopen_sales_day(date) from public;
grant execute on function public.reopen_sales_day(date) to authenticated;
