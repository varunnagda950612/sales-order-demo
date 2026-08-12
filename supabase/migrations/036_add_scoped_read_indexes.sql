-- Additional read-path indexes for the production Next.js app.
-- These support scoped date-range reads after moving Supabase back to the
-- primary source of truth. They do not change data, RLS, or write behavior.

create index if not exists collections_sales_person_created_at_idx
on public.collections(sales_person_id, created_at desc);

create index if not exists collections_sales_payment_created_at_idx
on public.collections(sales_person_id, payment_mode, created_at desc);

create index if not exists collections_payment_created_at_idx
on public.collections(payment_mode, created_at desc);

create index if not exists sales_day_sessions_salesperson_work_started_idx
on public.sales_day_sessions(sales_person_id, work_date desc, started_at desc);

create index if not exists sales_day_sessions_work_started_idx
on public.sales_day_sessions(work_date desc, started_at desc);

create index if not exists sales_targets_salesperson_end_product_idx
on public.sales_targets(sales_person_id, end_date, product_name);

create index if not exists sales_targets_end_product_idx
on public.sales_targets(end_date, product_name);

create index if not exists route_overrides_override_date_idx
on public.route_overrides(override_date desc);

create index if not exists product_skus_active_size_idx
on public.product_skus(sku_size)
where active = true;
