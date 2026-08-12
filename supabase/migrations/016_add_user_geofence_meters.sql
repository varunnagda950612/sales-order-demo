alter table public.profiles
  add column if not exists geofence_meters integer not null default 100;

alter table public.profiles
  drop constraint if exists profiles_geofence_meters_range;

alter table public.profiles
  add constraint profiles_geofence_meters_range
  check (geofence_meters between 10 and 1000);
