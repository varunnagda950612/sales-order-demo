alter table public.orders
add column if not exists replacement_notes text;
