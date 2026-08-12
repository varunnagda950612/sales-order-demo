# DB Logic Map - Manish Masala PWA v1 (`main` branch)

This document maps **which pages/features read or write which tables** in the original PWA on the `main` branch.

It is intended for:

- rebuild planning
- API design
- backend redesign
- knowing page-to-database dependencies

This is a **functional data dependency map**, not a schema definition.

For schema details, refer to:

- [AI_CONTEXT.md](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/AI_CONTEXT.md)
- `supabase/migrations/*.sql`

---

## 1. Main Tables Used in the App

The original PWA logic depends primarily on these public tables:

1. `profiles`
2. `shops`
3. `products`
4. `product_skus`
5. `orders`
6. `order_items`
7. `visit_proofs`
8. `sales_targets`
9. `route_overrides`
10. `area_route_schedules`
11. `collections`
12. `audit_logs`

There is also dependency on:

- `auth.users` through Supabase Auth
- Supabase storage for product image URLs

---

## 2. Table-by-Page Map

## 2.1 Login Screen

### Reads

- `auth.users` via Supabase Auth
- `profiles`

### Writes

- Supabase auth session
- local app session/local state

### Logic

1. Login ID is converted to synthetic email
2. Auth is validated against Supabase
3. Matching `profiles` row is fetched
4. Role and `active` status are validated

### Important fields used

From `profiles`:

- `id`
- `full_name`
- `role`
- `login_id`
- `active`
- `geofence_meters`

---

## 2.2 Sales - My Shops

### Reads

- `shops`
- `profiles`
- `visit_proofs`
- `route_overrides`
- `area_route_schedules`

### Writes

- `shops` (when first GPS anchor is saved)
- `visit_proofs`

### Logic

The page builds the salesperson’s visible route from:

- assigned shops
- area schedule due logic
- route override logic
- prior GPS/visit state

### Important read fields

From `shops`:

- `id`
- `name`
- `phone`
- `address`
- `area`
- `visit_day`
- `assigned_to`
- `location_lat`
- `location_lng`
- `location_accuracy`
- `location_captured_at`

From `route_overrides`:

- `sales_person_id`
- `override_date`
- `area`

From `area_route_schedules`:

- `area`
- `sales_person_id`
- `visit_day`
- `frequency`
- `start_date`

From `visit_proofs`:

- `shop_id`
- `sales_person_id`
- `visit_type`
- `captured_at`
- `latitude`
- `longitude`
- `accuracy`
- `distance_meters`

### Important write cases

#### First route visit with no shop GPS anchor

Writes to `shops`:

- `location_lat`
- `location_lng`
- `location_accuracy`
- `location_captured_at`

#### Route check-in / order start / no order

Writes to `visit_proofs`:

- `shop_id`
- `sales_person_id`
- `visit_type`
- `latitude`
- `longitude`
- `accuracy`
- `distance_meters`
- `captured_at`

---

## 2.3 Sales - Route Order Entry

### Reads

- `products`
- `product_skus`
- `shops`
- `profiles`
- `visit_proofs`

### Writes

- `orders`
- `order_items`
- sometimes `visit_proofs`

### Logic

A route order depends on:

- valid GPS/visit proof
- product master
- selected shop

### Important read fields

From `products`:

- `id`
- `name`
- `category`
- `photo_url`
- `active`

From `product_skus`:

- `id`
- `product_id`
- `sku_size`
- `sku_code`
- `rate`
- `mrp`
- `active`

From `shops`:

- shop identity and GPS anchor

### Writes

To `orders`:

- `id`
- `shop_id`
- `sales_person_id`
- `sales_person_name`
- `order_type`
- `status`
- `notes`
- `replacement_notes`
- `subtotal`
- `gst_rate`
- `gst_amount`
- `grand_total`
- `visit_lat`
- `visit_lng`
- `visit_accuracy`
- `visit_captured_at`
- `created_at`
- `updated_at`

To `order_items`:

- `order_id`
- `product_id`
- `product_sku_id`
- `product_name`
- `sku_size`
- `sku_code`
- `rate`
- `mrp`
- `quantity`
- `line_total`

### Special case

If a route order has no valid visit proof yet, the app may write an `order_started` proof before allowing submission.

---

## 2.4 Sales - Adhoc Order

### Reads

- `shops`
- `products`
- `product_skus`
- `profiles`

### Writes

- `orders`
- `order_items`
- may use GPS in order payload

### Logic difference from route order

Adhoc does not rely on the same route geofence flow.

### Important order fields

In `orders`:

- `order_type = 'adhoc'`

This affects:

- UI tags
- PDF output
- route reporting semantics

---

## 2.5 Sales - My Orders

### Reads

- `orders`
- `order_items`
- `shops`
- `profiles`
- `visit_proofs`

### Writes

- `orders` (edit/update)
- `order_items` (replace/update line set)
- `orders` delete flow

### Logic

Salesperson sees only their own orders.

### Important read fields

From `orders`:

- `shop_id`
- `sales_person_id`
- `order_type`
- `status`
- `notes`
- `replacement_notes`
- `subtotal`
- `gst_rate`
- `gst_amount`
- `grand_total`
- `created_at`
- `updated_at`

### Update logic

Editing an order writes:

- `status = 'updated'`
- updated items
- updated totals
- updated notes
- `updated_at`
- `change_log`

### Delete logic

Admin can delete broadly.  
Sales delete behavior depends on current permission logic and time restrictions.

Deletes affect:

- `orders`
- implicitly linked `order_items`

---

## 2.6 Sales - Collections

### Reads

- `collections`
- `shops`
- `profiles`
- `visit_proofs`
- `orders` indirectly for operational context

### Writes

- `collections`

### Logic

Collections are filtered by:

- salesperson
- area
- date
- payment mode

### Important read fields

From `collections`:

- `id`
- `shop_id`
- `sales_person_id`
- `collection_type`
- `bill_date`
- `bill_number`
- `payment_mode`
- `cheque_date`
- `amount`
- `discount`
- `replacement`
- `created_at`
- `updated_at`

From `shops`:

- `id`
- `name`
- `area`

### Writes

On create/update:

- `shop_id`
- `sales_person_id`
- `collection_type`
- `bill_date`
- `bill_number`
- `payment_mode`
- `cheque_date`
- `amount`
- `discount`
- `replacement`

### Important business dependency

Collections for route shops depend on same-day visit completion logic, which is derived from:

- `visit_proofs`
- `orders`

not merely from `shops.location_*`.

---

## 2.7 Sales - Targets

### Reads

- `sales_targets`
- `orders`
- `order_items`
- `product_skus`
- `profiles`

### Writes

- none from salesperson target view

### Logic

Target progress uses:

- target rows from `sales_targets`
- matching ordered SKU quantities from `order_items`
- SKU size/grams logic for KG conversion

### Important read fields

From `sales_targets`:

- `sales_person_id`
- `product_sku_id`
- `sku_code`
- `grams`
- `target_kg`
- `start_date`
- `end_date`

From `order_items`:

- `product_sku_id`
- `quantity`

From `orders`:

- `sales_person_id`
- `created_at`
- `status`

---

## 2.8 Admin/Manager - Orders

### Reads

- `orders`
- `order_items`
- `shops`
- `profiles`
- `visit_proofs`

### Writes

- `orders`
- `order_items`
- delete operations

### Logic

This page is the central order review page.

### Filters depend on

- `profiles` for salesperson filter values
- `shops.area` for area filter values
- `orders.created_at` / `orders.updated_at` for date/time filters

### Map link dependency

Map action depends on order GPS fields:

- `visit_lat`
- `visit_lng`
- `visit_accuracy`
- `visit_captured_at`

### PDF export dependency

Uses filtered `orders` + `order_items` + shop/user lookup data.

---

## 2.9 Admin/Manager - Collections

### Reads

- `collections`
- `shops`
- `profiles`

### Writes

- `collections`

### Logic

Centralized review/edit/export of all collections.

### Filters depend on

- `profiles`
- `shops.area`
- `collections.created_at`
- `collections.payment_mode`

### PDF export dependency

Uses:

- `collections`
- `shops`
- `profiles`

to build grouped report output.

---

## 2.10 Admin/Manager - Visit Status

### Reads

- `visit_proofs`
- `shops`
- `profiles`
- `route_overrides`
- `area_route_schedules`
- `orders`
- `order_items`

### Writes

- none directly from reporting view

### Logic

Visit Status is a derived analytics page, not a CRUD page.

It computes:

- expected route shops
- checked in shops
- pending shops
- productive visits
- unproductive visits
- filtered KG sold

### Core table dependencies

#### Expected route computation

Uses:

- `shops`
- `route_overrides`
- `area_route_schedules`
- sometimes fallback `visit_day`

#### Visit completion computation

Uses:

- `visit_proofs`

#### Productive / KG sold

Uses:

- `orders`
- `order_items`

### Important logic rule

Do not rebuild this page using only `orders`.  
It must remain dependent on `visit_proofs`.

---

## 2.11 Admin/Manager - Targets

### Reads

- `sales_targets`
- `profiles`
- `products`
- `product_skus`
- `orders`
- `order_items`

### Writes

- `sales_targets`

### Logic

Admin creates, edits, and reviews SKU-wise targets.

### Form dependencies

Target creation/edit needs:

- `profiles` for salesperson dropdown
- `products` / `product_skus` for SKU dropdown

### Progress computation dependencies

- `orders`
- `order_items`
- `product_skus`

### Important write fields

To `sales_targets`:

- `sales_person_id`
- `product_id`
- `product_sku_id`
- `product_name`
- `sku_size`
- `sku_code`
- `grams`
- `target_kg`
- `start_date`
- `end_date`
- `created_by`

---

## 2.12 Admin/Manager - Shops

### Reads

- `shops`
- `profiles`
- `route_overrides`
- `area_route_schedules`
- `visit_proofs`

### Writes

- `shops`
- `route_overrides`
- `area_route_schedules`

### Logic

This page is the shop master and route-control center.

### Shop read dependencies

From `shops`:

- `name`
- `phone`
- `address`
- `area`
- `visit_day`
- `assigned_to`
- `location_lat`
- `location_lng`
- `location_accuracy`
- `location_captured_at`

From `profiles`:

- salesperson names/ids

### Shop create/update writes

To `shops`:

- `name`
- `phone`
- `address`
- `area`
- `assigned_to`
- `visit_day` where applicable in old structure
- GPS reset/update fields

### GPS reset writes

To `shops`:

- clear `location_lat`
- clear `location_lng`
- clear `location_accuracy`
- clear `location_captured_at`

### Route override writes

To `route_overrides`:

- `sales_person_id`
- `override_date`
- `area`
- `created_by`

### Area schedule writes

To `area_route_schedules`:

- `area`
- `sales_person_id`
- `visit_day`
- `frequency`
- `start_date`
- `created_by`

---

## 2.13 Admin/Manager - Products

### Reads

- `products`
- `product_skus`

### Writes

- `products`
- `product_skus`

### Logic

Product master depends on split header/sku structure.

### Reads

From `products`:

- `id`
- `name`
- `category`
- `photo_url`
- `active`

From `product_skus`:

- `id`
- `product_id`
- `sku_size`
- `sku_code`
- `rate`
- `mrp`
- `active`

### Writes

Product create/edit may touch:

- `products.name`
- `products.category`
- `products.photo_url`
- `products.active`

SKU create/edit may touch:

- `product_skus.sku_size`
- `product_skus.sku_code`
- `product_skus.rate`
- `product_skus.mrp`
- `product_skus.active`

### Search dependency

Search is expected to work on:

- visible product name
- hidden SKU code

---

## 2.14 Admin/Manager - GPS Route

### Reads

- `visit_proofs`
- `shops`
- `profiles`
- optionally route-path edge function output

### Writes

- none from normal viewing

### Logic

This screen reconstructs the day’s route.

### Read fields

From `visit_proofs`:

- `shop_id`
- `sales_person_id`
- `latitude`
- `longitude`
- `accuracy`
- `distance_meters`
- `visit_type`
- `captured_at`

From `shops`:

- `name`
- `area`
- GPS anchor fields if needed for context

From `profiles`:

- salesperson name

### External dependency

- `route-path` Edge Function
- Google Routes API

---

## 2.15 Admin - Users

### Reads

- `profiles`
- `shops`
- `orders`
- Supabase Auth user context indirectly

### Writes

- `profiles`
- Supabase Auth through `admin-users` Edge Function

### Logic

User page merges app user records with operational context.

### Reads

From `profiles`:

- `id`
- `full_name`
- `role`
- `login_id`
- `active`
- `geofence_meters`

Also may compute usage context from:

- `shops.assigned_to`
- `orders.sales_person_id`

### Writes

To `profiles`:

- `full_name`
- `role`
- `login_id`
- `active`
- `geofence_meters`

To Supabase Auth via edge function:

- create user
- reset password
- role-backed setup flow

---

## 3. Cross-Cutting Logic by Table

## 3.1 `profiles`

### Used by

- Login
- topbar user identity
- role permissions
- salesperson dropdowns
- user management
- geofence settings
- route and collection ownership

### Pages touching it

- Login
- Orders
- Collections
- Visit Status
- Targets
- Shops
- GPS Route
- Users

---

## 3.2 `shops`

### Used by

- route list generation
- shop card display
- address/area display
- GPS anchor
- direction link
- adhoc search
- admin shop master
- order/collection display lookups

### Pages touching it

- My Shops
- Adhoc Order
- My Orders
- Collections
- Orders
- Visit Status
- Shops
- GPS Route

---

## 3.3 `products`

### Used by

- order entry display
- admin product master
- target setup support

### Pages touching it

- Order modal
- Products
- Targets

---

## 3.4 `product_skus`

### Used by

- order entry catalog
- SKU search
- KG conversion
- target assignment
- target progress

### Pages touching it

- Order modal
- Products
- Targets

---

## 3.5 `orders`

### Used by

- route/ad hoc order storage
- order list pages
- visit productivity metrics
- PDF export
- collection unlock context

### Pages touching it

- Order modal
- My Orders
- Orders
- Visit Status
- Targets

---

## 3.6 `order_items`

### Used by

- detailed order lines
- KG calculation
- PDF export
- target progress

### Pages touching it

- Order modal
- My Orders
- Orders
- Targets
- PDF flows

---

## 3.7 `visit_proofs`

### Used by

- route completion
- GPS route timeline
- productive/unproductive logic
- no-order capture
- duplicate check-in protection

### Pages touching it

- My Shops
- Visit Status
- GPS Route
- Orders (map-related logic)

---

## 3.8 `sales_targets`

### Used by

- target setup
- target reporting

### Pages touching it

- Targets (admin)
- Targets (sales)

---

## 3.9 `route_overrides`

### Used by

- temporary reassignment of area route
- shop visibility
- route summary
- visit status expected route calculation

### Pages touching it

- Shops
- My Shops
- Visit Status

---

## 3.10 `area_route_schedules`

### Used by

- deciding which areas are due today
- weekly/biweekly schedule logic
- expected route coverage

### Pages touching it

- Shops
- My Shops
- Visit Status

---

## 3.11 `collections`

### Used by

- salesperson collection entry
- admin collection review
- collection PDF
- amount summaries

### Pages touching it

- Collections (sales)
- Collections (admin/manager)
- PDF exports

---

## 3.12 `audit_logs`

### Used by

- mostly backend traceability / future diagnostics

### User-facing dependency

Minimal in v1 UI.

---

## 4. Edge Functions and Non-Table Dependencies

## 4.1 `admin-users` Edge Function

### Used by

- Users page

### Purpose

- create auth users
- reset passwords
- manage app-side user setup paired with auth

### Related DB dependencies

- `profiles`
- `auth.users`

---

## 4.2 `route-path` Edge Function

### Used by

- GPS Route page

### Purpose

- reconstruct route path from visit coordinates using Google Routes API

### Related dependencies

- `visit_proofs`
- Google Routes API

---

## 4.3 Supabase Storage / Product Image URLs

### Used by

- Products page
- Order entry display

### Purpose

- host optional product images

### Related fields

- `products.photo_url`

---

## 5. Page-to-Table Write Risk Summary

These are the highest-risk write flows in the original PWA:

## 5.1 Orders

Tables:

- `orders`
- `order_items`
- sometimes `visit_proofs`

Why risky:

- business-critical
- owner is highly sensitive to silent loss
- sync failures must be explicit
- duplicate/empty order history exists

## 5.2 Visit proofs / GPS check-in

Tables:

- `visit_proofs`
- sometimes `shops`

Why risky:

- impacts route access
- impacts visit status
- impacts GPS route analytics
- duplicate proof issues occurred historically

## 5.3 Shops / GPS reset / first GPS save

Tables:

- `shops`

Why risky:

- wrong first GPS anchor affects all future geofence checks

## 5.4 Collections

Tables:

- `collections`

Why risky:

- multi-row structure
- route-vs-adhoc unlock rules
- cheque date conditional logic
- PDF/reporting dependency

## 5.5 Targets

Tables:

- `sales_targets`

Why risky:

- date-bound calculations
- SKU-specific logic
- progress aggregation can be wrong if over-simplified

---

## 6. Rebuild Guidance from DB Perspective

If the app is rebuilt on another stack:

### Keep these backend relationships intact

1. `orders` must remain separate from `order_items`
2. `visit_proofs` must remain separate from `orders`
3. `shops` must keep anchor GPS independently from visit events
4. `route_overrides` must remain date-specific
5. `area_route_schedules` must support weekly and biweekly logic
6. `sales_targets` must remain SKU-specific and date-bounded
7. `collections` must support multiple rows per shop over time and payment-mode reporting

### If APIs are redesigned

At minimum preserve separate API/use-case support for:

- login/profile fetch
- route shop fetch
- GPS check-in
- no-order visit save
- route order save
- adhoc order save
- collection save
- order/collection PDF data fetch
- target progress fetch
- route override CRUD
- schedule CRUD
- user create/reset-password

---

## 7. Related Reference Documents

- [Logic.md](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/Logic.md)
- [Screen-map.md](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/Screen-map.md)
- [AI_CONTEXT.md](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/AI_CONTEXT.md)

