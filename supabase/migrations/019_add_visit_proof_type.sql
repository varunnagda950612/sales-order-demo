alter table public.visit_proofs
  add column if not exists visit_type text not null default 'check_in';

alter table public.visit_proofs
  drop constraint if exists visit_proofs_visit_type_check;

alter table public.visit_proofs
  add constraint visit_proofs_visit_type_check
  check (visit_type in ('check_in', 'order_started', 'no_order'));
