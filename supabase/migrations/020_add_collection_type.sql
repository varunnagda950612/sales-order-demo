alter table public.collections
  add column if not exists collection_type text not null default 'route';

alter table public.collections
  drop constraint if exists collections_collection_type_check;

alter table public.collections
  add constraint collections_collection_type_check
  check (collection_type in ('route', 'adhoc'));
