-- Optional read-performance indexes for the production Next.js app.
-- These do not change data, RLS, or write behavior.

create index if not exists orders_sales_person_created_at_idx
on public.orders(sales_person_id, created_at desc);

create index if not exists orders_created_at_idx
on public.orders(created_at desc);

create index if not exists orders_shop_id_idx
on public.orders(shop_id);

create index if not exists order_items_order_id_idx
on public.order_items(order_id);

create index if not exists visit_proofs_sales_person_captured_at_idx
on public.visit_proofs(sales_person_id, captured_at desc);

create index if not exists visit_proofs_captured_at_idx
on public.visit_proofs(captured_at desc);

create index if not exists visit_proofs_shop_id_idx
on public.visit_proofs(shop_id);

create index if not exists shops_assigned_area_name_idx
on public.shops(assigned_to, area, name);

create index if not exists shops_area_name_idx
on public.shops(area, name);

create index if not exists route_overrides_salesperson_date_idx
on public.route_overrides(sales_person_id, override_date);

create index if not exists area_route_schedules_route_lookup_idx
on public.area_route_schedules(area, sales_person_id, visit_day);

create index if not exists sales_targets_salesperson_date_idx
on public.sales_targets(sales_person_id, start_date, end_date);
