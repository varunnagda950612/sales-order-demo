# Project Handoff: Manish Masala Sales Order App

## 1. Project Overview

### Purpose of the application
This is an internal Progressive Web App (PWA) for **Manish Masala** to manage:

- shop visits by salespeople
- GPS-based check-ins and route verification
- order collection from retail shops
- ad hoc/urgent orders outside the planned route
- collection/payment entry (cash/cheque/UPI)
- admin/manager visibility into orders, visits, targets, routes, shops, products, and users

It is **not** a public consumer app and is **not** intended for app store distribution. It is deployed as a web app/PWA and installed on mobile devices through the browser.

### Business workflow
The core business workflow is:

1. Admin manages salespeople, managers, shops, products, route schedules, and targets.
2. Salesperson logs in on mobile.
3. Salesperson sees assigned route shops for the day/area.
4. Salesperson checks in at a shop with GPS.
5. Salesperson either:
   - places an order
   - marks **No Order**
   - later enters collections/payment for that visited shop
6. Admin/manager monitors:
   - orders
   - check-ins
   - productive vs unproductive visits
   - GPS route/timeline
   - collections
   - targets and progress

### Major features implemented
The project currently includes all of the following major modules/features:

#### Authentication and roles
- Supabase Auth login using login ID + password
- Roles:
  - `admin`
  - `manager`
  - `sales`
- Admin can create users via Supabase Edge Function
- Admin can reset user password via Supabase Edge Function
- Manager is read-only for most master data and user actions
- Salesperson can only access own operational data

#### Shops
- Shop list per salesperson
- Shop add/edit
- Shop Excel bulk import
- Route override modal for temporary area assignment
- Area schedule management including:
  - weekly
  - biweekly
- Shop filters:
  - salesperson
  - area
  - GPS saved/pending
  - search
- Admin/manager view of all shops
- Salesperson sees assigned/overridden shops only
- “Get Direction” button from shop card
- GPS reset by admin for wrongly saved shop location
- Owner field exists in DB, but UI/logic was intentionally removed from active workflows

#### GPS / visit tracking
- GPS capture on check-in
- First visit stores shop GPS reference
- Subsequent order access requires salesperson to be within geofence distance
- Geofence range is configurable per user (`geofence_meters`)
- Location permission must be enabled
- Photo verification was completely removed
- Visit proofs support types:
  - `check_in`
  - `order_started`
  - `no_order`
- Admin-only GPS route view
- Map pin display for visit proofs
- Google Routes API integration for walking-route reconstruction
- Open route maps / route preview
- Visit status reporting uses visit proofs, not just orders

#### Sales orders
- Route orders
- Ad hoc orders (outside route, urgent phone orders)
- Product search by product name and SKU code
- Product images in order UI
- Quantity in pieces
- KG conversion shown from piece count based on SKU gram size
- Free notes
- Replacement notes
- GST/subtotal/grand total in app views
- Salesperson order confirmation review screen before final submit
- Edit order
- Delete order (admin)
- Order locking behavior/business rule discussion exists, but see Known Issues / Pending
- Updated orders are marked with `updated`
- Ad hoc orders are tagged as `adhoc`
- Orders PDF export
- Salesperson share/download of PDF
- Export naming logic now respects selected salesperson filter for admin; defaults to `admin` when no salesperson selected

#### Collections
- Collection button enabled only after shop visit is operationally completed:
  - route shop: after order submission or confirmed no-order
  - ad hoc shop: collection allowed in ad hoc flow too
- Multi-row bill entry in modal
- Fields:
  - bill date
  - bill number
  - amount
  - discount
  - replacement
  - payment mode
  - cheque date when payment mode = cheque
- Amount-to-be-collected live total block in modal
- Edit/delete collection
- Collections list table with filters
- Collections list table includes a Payment Mode filter:
  - `All`
  - `Cash`
  - `Cheque`
  - `UPI`
- Collections list table footer shows filtered amount-only totals by payment mode:
  - Cash total
  - Cheque total
  - UPI total
- Collections PDF export
- Collections PDF currently grouped by shop, not by payment mode sections
- Collections PDF includes final boxed mode totals

#### Products
- Product add/edit
- Bulk Excel upload
- Product image URL support
- SKU code, rate, MRP, size handled separately
- Search by name and SKU code
- Display order customized based on business-defined product sequence
- Admin/manager product search and add-product modal
- Product list internal scroll

#### Targets
- Admin target management
- Multiple SKU-wise targets per salesperson
- Start/end dates
- Target in KG
- Completed target calculated from order pieces x grams
- Salesperson target progress UI
- Circular gradient progress UI for sales
- Admin target table and modal form
- Manager/admin visibility
- Over-achievement capped in overall summary calculations

#### Users / team
- Admin can create:
  - sales
  - manager
  - admin
- Admin can edit users
- Admin can set per-user geofence
- Admin can reset password
- Manager is intentionally read-only in many operational areas

#### Reporting / PDFs
- Orders PDF:
  - card-based A5 portrait, 3-column layout
  - route orders first, ad hoc orders at end
  - updated orders get red `Updated` tag
  - continuation logic across columns/pages
- Collections PDF:
  - grouped by shop
  - shop totals
  - mode column (`cash`, `chq`, `UPI` style behavior currently implemented partly as labels in raw PDF; see Known Issues)
  - final cash / UPI / cheque totals in separate boxes
- Filename/subtitle selection for admin exports uses selected salesperson when filtered; otherwise `admin`

### Current project status
Current status is **production-capable but still evolving**:

- App is modularized into feature-based architecture.
- Supabase production mode is active and supported.
- LocalStorage fallback still exists for development/fallback behavior.
- PWA behavior, caching, security headers, and deployment are implemented.
- Realtime sync is implemented, but sync/logout/session behavior remains an area requiring caution.
- Database schema and Edge Functions are present under `supabase/`.
- Tests and production build are passing at the time of this handoff.
- Current tab order is business-specific and should not be casually changed:
  - Admin/Manager: `Orders -> Collections -> Visit Status -> Targets -> Shops -> Products -> GPS Route -> Users`
  - Sales: `My Shops -> Adhoc Order -> My Orders -> Collections -> Targets`

This project is no longer a throwaway prototype. It is an actively structured production-style internal app, though some parts are still brittle and require disciplined maintenance.

---

## 2. Tech Stack

### Frontend
- **Vanilla JavaScript (ES modules)**
- No React/Vue/Angular
- Server-rendered HTML is **not** used
- Rendering is done via string-template view modules + a central app render function

### Frameworks
- No SPA framework
- App is a manual SPA built on top of:
  - Vite
  - browser DOM APIs
  - modular ES modules

### Libraries
- `@supabase/supabase-js`
- `@vercel/speed-insights`

### Build tools
- **Vite** (`^8.0.16`)
- npm scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm test`

### Backend
- **Supabase**
  - Postgres database
  - Supabase Auth
  - Supabase Realtime
  - Supabase Edge Functions
  - Supabase Storage (used for product images when desired)

### Database
- **Supabase Postgres**

### APIs
- Supabase Auth APIs via `supabase-js`
- Supabase table access via `supabase-js`
- Supabase RPC:
  - `save_order_with_items`
- Supabase Edge Functions:
  - `admin-users`
  - `route-path`
- Google Routes API (through Edge Function)
- Google Maps links / map URLs
- Optional Supabase public Storage URLs for product images

### Authentication
- Supabase email/password auth
- App login uses business-friendly `login_id`
- Login ID is transformed internally to an email:
  - `tarak.mehta` -> `tarak.mehta@manishmasala.local`

### Third-party services
- **Vercel** for deployment
- **Supabase** for backend/auth/realtime/storage
- **Google Routes API** for path reconstruction
- **Google Maps / OpenStreetMap style map display** in UI depending on context
- **Vercel Speed Insights**

---

## 3. Folder Structure

```text
MM-sales-order-app/
├─ app.js
├─ index.html
├─ styles.css
├─ manifest.webmanifest
├─ service-worker.js
├─ vercel.json
├─ package.json
├─ package-lock.json
├─ .env.example
├─ .env.local
├─ README.md
├─ docs/
├─ icons/
├─ public/
├─ samples/
├─ src/
├─ supabase/
├─ tests/
├─ dist/
└─ tmp/
```

### Important folders

#### `src/`
Core application code.

#### `src/app/`
Top-level app runtime helpers:
- bootstrap
- cloud sync orchestration
- idle logout
- PWA update handling

#### `src/features/`
Feature-specific handlers and workflow modules:
- collections
- orders
- products
- routes
- shops
- targets
- team
- visit-status

#### `src/repositories/`
Client-side data access layer.  
This abstracts reads/writes to local app state and was introduced to make cloud sync and future refactors safer.

#### `src/services/`
Business logic and integration layer:
- GPS
- maps
- order calculations
- product parsing/import logic
- route reconstruction
- Supabase data access
- target progress logic
- visit status logic

#### `src/views/`
View/template modules that return HTML strings for each area.

#### `supabase/migrations/`
Database migrations. These are authoritative for current schema evolution.

#### `supabase/functions/`
Supabase Edge Functions:
- `admin-users`
- `route-path`

#### `tests/`
Node-based business-logic regression tests.

#### `samples/`
Excel templates/samples for shop/product imports.

#### `docs/`
Project documentation such as production rollout.

#### `icons/`
App and PWA icons/logos.

#### `public/`
Public assets, including service worker copy used in build/deploy flows.

#### `dist/`
Build output from Vite.

---

## 4. Application Architecture

### High-level architecture
This is a **single-page application without a framework router**.  
The architecture is:

- `app.js` = orchestration and delegated event wiring
- `src/state.js` = global state container + persistence
- `src/views/*` = HTML template renderers
- `src/features/*` = UI event handlers/workflows
- `src/services/*` = business/domain logic and cloud integration
- `src/repositories/*` = state mutation and entity-level persistence helpers
- `src/selectors.js` = derived state / visibility / filtering logic

### Routing / navigation
There is **no URL-based router**.  
Navigation is tab/state based.

Examples:
- Sales tabs:
  - My Shops
  - Adhoc Order
  - My Orders
  - Targets
  - Collections
- Admin/Manager tabs:
  - Orders
  - Visit Status
  - Targets
  - Shops
  - Products
  - GPS Route
  - Users
  - Collections (in relevant flows/views)

The active tab is stored in app state.  
Tab switching is rendered manually in `app.js`.

Important behavior:
- normal page reload is intended to preserve the current active tab
- logout should reset to the role-default starting tab
- PWA/app-update driven reset should return users to the default starting tab so new code paths are used cleanly
- startup defaults:
  - admin/manager -> `orders`
  - sales -> `shops`

### State management
State is centralized in `src/state.js`.

Key concepts:
- `state`
- `setState()`
- `replaceState()`
- `setTransientState()`
- `subscribeState()`

Persistent state is stored in:
- `localStorage` under `manishMasalaSalesApp.v1`

Even in production mode, local state is still used as the local working copy/cache.

There is also a runtime `storageMode` concept used to distinguish local mode vs Supabase-backed mode. Future sessions should not assume the app is purely local or purely remote.

### Repositories
Repositories are the thin state mutation layer.  
Examples:
- `orderRepository.js`
- `shopRepository.js`
- `collectionRepository.js`
- `userRepository.js`

Responsibilities:
- CRUD against local in-memory state
- produce consistent local updates
- isolate mutation logic from UI handlers

### Services
Services contain:
- domain logic
- import parsing
- Supabase mapping and calls
- route/path reconstruction
- totals and calculations
- view-independent business rules

### API layer
The API layer is mainly:
- `src/services/supabaseDataService.js`
- `src/supabase-client.js`

This handles:
- authentication
- loading app data from Supabase
- saving entities
- deleting entities
- invoking RPCs
- invoking Edge Functions

### Realtime layer
- `src/services/realtimeService.js`
- `src/app/cloudSync.js`

Realtime is used to refresh application data silently from Supabase changes.  
Critical tables are subscribed for refresh behavior.

Important nuance:
- the app tries to preserve active tab and scroll position during many refreshes
- this was added specifically because earlier realtime refreshes caused:
  - tab rollback
  - filter reset pain
  - scroll reset to top
  - poor admin/sales UX during long sessions

### PWA layer
- `service-worker.js`
- `public/service-worker.js`
- `src/app/pwaUpdates.js`
- `manifest.webmanifest`

The app supports installation as a PWA.

The update strategy is intentionally opinionated:
- new deployed code should force users onto fresh app state more aggressively than a normal in-session rerender
- stale cached builds on mobile were a real production issue earlier in the project

### Rendering strategy
This project uses HTML-string templates from `src/views/*`.  
No virtual DOM, no JSX, no framework components.

### Event handling
The app uses **delegated DOM events** centrally in `app.js`:
- submit
- input
- change
- keydown
- keyup
- click-based actions

This avoids rebinding listeners after each render.

### Scroll strategy
Scroll behavior is intentionally mixed by device/use case:
- mobile tends toward full-page scroll for easier touch interaction
- desktop/tablet retains internal scroll areas for large lists/tables where appropriate
- a circular back-to-top button appears after sufficient scroll
- scroll snapshots are restored on many rerenders to avoid operational disruption

This is business-driven UX, not accidental CSS behavior. Future changes must preserve it unless intentionally redesigning the flow.

---

## 5. Database

## Core enums / types

### `public.app_role`
Current values:
- `admin`
- `sales`
- `manager`

### `public.order_status`
- `placed`
- `updated`
- `cancelled`

### `public.order_type`
- `route`
- `adhoc`

---

## Tables

### `public.profiles`
Maps Supabase Auth users to app users.

Important fields:
- `id` (UUID, PK, references `auth.users.id`)
- `full_name`
- `role` (`app_role`)
- `login_id`
- `active`
- `geofence_meters` (added later)
- `created_at`
- `updated_at`

Used for:
- role control
- login ID mapping
- per-user geofence
- active/inactive control

---

### `public.shops`
Stores all shops.

Important fields:
- `id`
- `name`
- `owner` (legacy still in DB; mostly removed from UI use)
- `phone`
- `address`
- `area`
- `visit_day`
- `assigned_to` -> `profiles.id`
- `location_lat`
- `location_lng`
- `location_accuracy`
- `location_captured_at`
- `created_by`
- `created_at`
- `updated_at`

Used for:
- route assignment
- area/day grouping
- saved GPS reference for geofencing

---

### `public.products`
Product master.

Important fields:
- `id`
- `name`
- `category`
- `photo_url`
- `active`
- `created_at`
- `updated_at`

Notes:
- `photo_url` is optional
- app expects HTTPS URLs when entered/uploaded through UI/import validation
- common production usage is a public Supabase Storage URL under a bucket such as `product-images`

---

### `public.product_skus`
SKU/variant master linked to products.

Important fields:
- `id`
- `product_id` -> `products.id`
- `sku_size`
- `sku_code`
- `rate`
- `mrp`
- `active`
- `created_at`
- `updated_at`

Relationship:
- one product has many SKU rows

Used for:
- order search
- price display
- KG conversion
- target tracking

---

### `public.orders`
Order header.

Important fields:
- `id`
- `shop_id` -> `shops.id`
- `sales_person_id` -> `profiles.id`
- `sales_person_name`
- `order_type` (`route` / `adhoc`)
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
- `change_log` (jsonb)
- `created_at`
- `updated_at`

Used for:
- route/ad hoc orders
- edit/update tracking
- map/order GPS correlation
- PDF reporting

---

### `public.order_items`
Order lines.

Important fields:
- `id`
- `order_id` -> `orders.id`
- `product_id` -> `products.id`
- `product_sku_id` -> `product_skus.id`
- `product_name`
- `sku_size`
- `sku_code`
- `rate`
- `mrp`
- `quantity`
- `line_total` (generated)
- `created_at`

Relationship:
- one order has many items

---

### `public.visit_proofs`
Shop visit evidence / GPS logs.

Important fields:
- `id`
- `shop_id`
- `order_id` (nullable)
- `sales_person_id`
- `latitude`
- `longitude`
- `accuracy`
- `distance_meters`
- `visit_type`
  - `check_in`
  - `order_started`
  - `no_order`
- `captured_at`
- `created_at`

This is critical to:
- visit status
- route history
- productive/unproductive visits
- GPS route maps

---

### `public.sales_targets`
Sales target rows.

Important fields:
- `id`
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
- `created_at`
- `updated_at`

Used for:
- SKU-wise target assignment
- per-salesperson target progress

---

### `public.route_overrides`
Temporary route reassignment.

Important fields:
- `id`
- `sales_person_id`
- `override_date`
- `area`
- `created_by`
- `created_at`

Used for:
- temporarily moving an area to another salesperson for a specific date

Important behavior:
- override is date-specific
- does not permanently change shop assignment

---

### `public.area_route_schedules`
Area-level visit scheduling.

Important fields:
- `id`
- `area`
- `sales_person_id`
- `visit_day`
- `frequency`
  - `weekly`
  - `biweekly`
- `start_date`
- `created_by`
- `created_at`
- `updated_at`

Used for:
- route generation by day
- biweekly area schedule logic
- visit status expected-route calculation

---

### `public.collections`
Collections / payment records.

Important fields:
- `id`
- `shop_id`
- `sales_person_id`
- `collection_type`
  - `route`
  - `adhoc`
- `bill_date`
- `bill_number`
- `cheque_date`
- `amount`
- `discount`
- `replacement`
- `payment_mode`
  - `cash`
  - `cheque`
  - `upi`
- `created_at`

Used for:
- payment collection entry
- reporting
- collection PDF export

---

### `public.audit_logs`
Audit-style data log.

Important fields:
- `id`
- `table_name`
- `record_id`
- `action`
- `changed_by`
- `old_data`
- `new_data`
- `created_at`

This exists but is not a heavily surfaced end-user feature.

---

## Relationships summary

- `profiles` 1 -> many `shops` via `assigned_to`
- `profiles` 1 -> many `orders`
- `profiles` 1 -> many `visit_proofs`
- `profiles` 1 -> many `sales_targets`
- `profiles` 1 -> many `collections`
- `products` 1 -> many `product_skus`
- `products` 1 -> many `order_items`
- `shops` 1 -> many `orders`
- `shops` 1 -> many `visit_proofs`
- `shops` 1 -> many `collections`
- `orders` 1 -> many `order_items`
- `orders` optionally linked to `visit_proofs`

---

## 6. API Documentation

This project mostly uses **Supabase via `@supabase/supabase-js`**, not a custom REST backend.

## Auth APIs

### Login
Used in:
- `signInCloud(loginId, password)`

Underlying call:
- `supabase.auth.signInWithPassword({ email, password })`

Request:
```js
{
  email: "<login_id>@manishmasala.local",
  password: "<password>"
}
```

Response:
- Supabase session/user
- then app loads matching profile row
- login IDs are normalized to lowercase
- internal email format uses `manishmasala.local` unless overridden server-side for admin user creation

### Logout
Used in:
- `signOutCloud()`

Underlying call:
- `supabase.auth.signOut()`

---

## Profile/table fetch APIs

Frontend loads these tables from Supabase:
- `profiles`
- `shops`
- `products`
- `product_skus`
- `orders`
- `visit_proofs`
- `collections`
- `sales_targets`
- `route_overrides`
- `area_route_schedules`
- `order_items` (chunked by order IDs)

All are accessed through `supabase.from("<table>").select(...)`.

Authentication:
- authenticated session required
- RLS enforced

---

## Write APIs

### Shops
- upsert shop
- bulk upsert shops
- delete shop

Tables:
- `shops`

### Products
- upsert product
- upsert/delete related `product_skus`
- delete product / SKU sets

Tables:
- `products`
- `product_skus`

### Orders
Primary path:
- `rpc("save_order_with_items", ...)`

Fallback path if RPC missing:
- upsert `orders`
- delete old `order_items`
- insert fresh `order_items`

Delete:
- delete `orders` row by `id`

### Visit proofs
- insert into `visit_proofs`

### Targets
- upsert `sales_targets`
- delete `sales_targets`

### Route overrides
- upsert `route_overrides`
- delete `route_overrides`

### Collections
- upsert `collections`
- delete `collections`

### Area route schedules
- upsert `area_route_schedules`
- delete `area_route_schedules`

### Profiles
- update via `saveCloudProfile(...)`
- used for user edit, geofence, active status

---

## RPC

### `public.save_order_with_items`
Purpose:
- atomic order save with items in production

Used by:
- `saveCloudOrder(order)`

Payload shape (conceptual):
```js
{
  p_order: { ...mapped order row... },
  p_items: [{ ...mapped item row... }, ...]
}
```

Behavior:
- if available, preferred over manual upsert/delete/insert flow
- intended to reduce partial-save risk

Authentication:
- authenticated session
- subject to RLS and function permissions

---

## Edge Functions

### `admin-users`
File:
- `supabase/functions/admin-users/index.ts`

Purpose:
- server-side admin user management without exposing service role key to frontend

Actions supported:
- `create-user`
- `create-salesperson` (legacy alias)
- `reset-password`

Request format:
```json
{
  "action": "create-user",
  "name": "Tarak Mehta",
  "loginId": "tarak.mehta",
  "password": "secret123",
  "role": "sales",
  "geofenceMeters": 100
}
```

Password reset request:
```json
{
  "action": "reset-password",
  "userId": "<uuid>",
  "password": "newpass123"
}
```

Response format:
```json
{
  "user": {
    "id": "<uuid>",
    "full_name": "Tarak Mehta",
    "login_id": "tarak.mehta",
    "role": "sales",
    "geofence_meters": 100,
    "active": true
  }
}
```

Auth:
- request must contain authenticated bearer token
- requester must be active admin
- CORS restricted using `APP_ORIGIN`

Edge Function secrets used:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ORIGIN`
- `LOGIN_EMAIL_DOMAIN`

---

### `route-path`
File:
- `supabase/functions/route-path/index.ts`

Purpose:
- compute walking route polyline between visit proof points using Google Routes API

Request format:
```json
{
  "points": [
    { "latitude": 19.21, "longitude": 73.08 },
    { "latitude": 19.22, "longitude": 73.09 }
  ]
}
```

Response format:
```json
{
  "polylines": ["<encoded polyline>", "..."],
  "distanceMeters": 12345,
  "durationSeconds": 4567
}
```

Rules:
- requires at least 2 points
- hard cap at 120 points
- batches max 25 points/request to Google API

Auth:
- authenticated bearer token required

Secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `APP_ORIGIN`

---

## Google Routes API
Used only from `route-path` Edge Function.

Endpoint:
- `https://routes.googleapis.com/directions/v2:computeRoutes`

Travel mode:
- `WALK`

---

## 7. Business Logic

## Login
- User enters login ID + password.
- App converts login ID to internal email format.
- Uses Supabase Auth sign-in.
- Loads `profiles` row and maps to local user object.
- Role determines visible tabs/features.
- Local fallback seed users still exist in code for dev/local legacy mode.

## Shop selection / route view
- Route shops are determined from:
  - assigned salesperson
  - area
  - visit day
  - route overrides
  - area route schedule frequency
- Salesperson sees today’s route and any override areas for today.
- Admin/manager can filter shops by salesperson and area.

## GPS / geofencing
- First route visit to shop stores shop GPS reference.
- Subsequent order access requires salesperson to be within geofence meters of saved shop location.
- Geofence can vary per user via `profiles.geofence_meters`.
- If phone location is disabled/unavailable, salesperson is blocked from order flow.
- Poor signal is treated differently than location disabled; the main business rule is location must be ON.
- Ad hoc orders skip route geofence requirement.

## Shop visit flow
For route shops:
1. salesperson opens shop
2. GPS check-in happens
3. a visit proof is stored
4. salesperson may:
   - place order
   - mark no order
   - later enter collection after order/no-order flow is completed

## No Order flow
- Marks a visit without order
- Stores visit proof with `visit_type = no_order`
- Used for unproductive visit calculations
- Unlocks collection button for that shop/day in route flow

## Product selection
- Product search supports:
  - product name
  - SKU code
- UI shows:
  - product image
  - name
  - MRP
  - rate
  - quantity in pieces
  - KG conversion from pieces
- Quantity entry is direct; there is no “add item” button pattern anymore
- Product ordering in UI follows business sequence, not default alpha sort
- Product image URLs are optional; missing image should not block product usage
- Search behavior is intentionally business-friendly, including short SKU-code-based matching patterns used in imports and operations

## Order submission
- Salesperson enters product quantities.
- Free and Replacement note text areas are supported.
- Order review screen shows selected lines before submit.
- GST and totals are calculated in app.
- Route orders save GPS with order.
- Ad hoc orders capture GPS at order time but do not require geofence.
- Orders are saved to local state first and synced to Supabase.
- There is an offline/pending sync model for orders and visit proofs.
- For route orders, the intended operational sequence is:
  1. GPS visit/check-in context established
  2. product quantities entered
  3. review screen shown
  4. final submit
- Salesperson pressing Enter while entering quantities should not accidentally jump workflow steps; this has been tuned in the delegated keyboard handling

## Order edit/update
- Sales can edit own orders.
- Admin can edit/delete.
- Updated orders get `status = updated`.
- Updated tag is shown in app and PDF.
- Order ordering in lists/export should remain oldest-to-newest.

## Visit status
Admin/manager can view:
- route shops
- checked in
- pending
- productive visit
- unproductive visit
- KG sold / ordered (replacing day-name KPI card)
- checked-in and pending tables
- date range, salesperson, area filters

Definitions:
- **Checked in**: based on GPS visit proof / saved-location logic, not only orders
- **Productive visit**: check-in + order placed
- **Unproductive visit**: no-order visit
- Pending = expected route shops not checked in for selected period

Important nuance:
- all-salespeople visit status is not a naive sum of fixed assignments; it must respect route overrides for the selected date
- first GPS save/check-in on a given date should count correctly for that selected date
- route schedules can be weekly or biweekly, and area schedule logic directly changes route shop counts

Area schedules and route overrides influence expected route shop population.

## Targets
- Admin sets SKU-wise target in KG with date range.
- Completed target = order quantity pieces x SKU grams / 1000.
- Only matching SKU counts toward the target.
- Overall target summary caps per-target overachievement at target KG.
- Sales UI emphasizes completed and pending target visually.

## Collections
- Available after route shop order/no-order completion.
- Ad hoc collection also supported without route-location dependency.
- Multiple bill entries in one modal.
- Cheque mode reveals cheque date field.
- Amount-to-be-collected live total is shown in the modal.
- Collection table supports filters by:
  - salesperson
  - area
  - creation date
  - payment mode (`All`, `Cash`, `Cheque`, `UPI`)
- Collection table footer shows cash / cheque / UPI totals for the currently visible rows.
- Collection table payment-mode totals are amount-only totals; `discount` and `replacement` must not be included.
- Collection table totals follow the same role and filter visibility as the table rows:
  - sales users see totals only for their own visible collections
  - admin/manager users see all visible collections when all salespeople are selected
  - admin/manager users see only the selected salesperson's visible collections when the salesperson filter is selected
- Collections PDF is shop-grouped and includes payment totals.

Permanent implementation notes from the collection payment-mode filter/totals update:
- No new files were added.
- No database schema changes were introduced.
- No Supabase API, RPC, Edge Function, or table contract changes were introduced.
- The changed client-side state/API surface is `selectedCollectionPaymentMode` in app state, seeded from `src/config.js` as `all`.
- `getVisibleCollections(user, appState)` now includes payment-mode filtering and remains the shared source for visible collection rows.
- Because PDF export uses the visible collections selector, the collection Payment Mode filter also affects exported collection rows/totals.
- Future collection filters should be added through the shared selector when the table and PDF export must stay aligned.

Important nuance:
- route-shop collection button should not be enabled merely because a GPS location exists on the shop master; it is intended to unlock only after that day’s route visit is operationally completed via order submit or no-order confirmation
- cheque mode exposes cheque date and cheque date can be past or future
- collection modal has a permanent “Amount to be collected” summary block that totals only the `Amount` fields
- collection table footer totals also total only `Amount` fields
- collection payment-mode filtering is implemented in shared visibility logic so the table and PDF export use the same filtered collection set
- collection PDF is no longer grouped by payment-mode sections; any copy implying that is stale and should be corrected if touched

## Route overrides
- Admin can temporarily assign an area to another salesperson for a specific date.
- Salesperson and admin shop/visit views should honor the override date.
- This is not a permanent reassignment.
- After date changes, normal route logic resumes.

## Area schedules
- Admin can define area schedules:
  - weekday
  - weekly / biweekly
  - start date
- Used in visit status and route expectations.

## Reports / PDFs
### Orders PDF
- A5 portrait
- 3-column card layout
- route orders before ad hoc orders
- updated route orders get red updated badge
- continuation handling across columns/pages
- selected salesperson naming is respected in admin export subtitle + filename

### Collections PDF
- grouped by shop
- multiple bill rows stay together per shop
- shop total shown when multiple rows exist
- mode totals shown in separate summary boxes
- selected salesperson naming is respected in admin export subtitle + filename

## Permissions
### Admin
Can:
- manage all master data
- create/edit/delete users
- reset passwords
- edit/delete orders
- manage targets
- reset GPS
- manage route overrides
- manage area schedules
- view everything
- export everything
- set per-user geofence distance
- create sales / manager / admin users through the edge function-backed workflow

### Manager
Can:
- view broad operational data similar to admin
- cannot perform destructive/write-heavy master operations in the same way as admin
- intended as read-only oversight role

### Sales
Can:
- view own route/ad hoc data
- check in
- place/edit own orders
- add collections
- view/share own PDFs
- cannot perform admin-only master management

---

## 8. File Dependency Map

## App shell / orchestration
- `app.js`
  - central render function
  - delegated events
  - tab orchestration
  - integrates views, features, state
- `index.html`
  - app entry
- `styles.css`
  - entire visual system

## State and shared derived logic
- `src/state.js`
  - global state container
  - local persistence
  - subscriptions
- `src/config.js`
  - seed data
  - constants
  - storage key
- `src/selectors.js`
  - current user
  - role checks
  - filtered shops/orders/collections
  - geofence meters lookup
  - route override helpers
  - date formatting helpers
  - area filtering logic tied to weekday/date/override/schedule rules

## Authentication / bootstrap
- `src/supabase-client.js`
  - Supabase client init
  - env-based configuration
- `src/app/bootstrap.js`
  - login bootstrap
  - initial cloud session
  - online sync registration
  - startup UI reset
- `src/services/supabaseDataService.js`
  - sign-in/sign-out
  - fetch/save/delete all cloud entities

## Orders
- `src/views/ordersView.js`
  - orders list
  - order modal
  - order review UI
- `src/features/orders/orderFilters.js`
  - order filter state handling
- `src/features/orders/orderReview.js`
  - review-step handling
- `src/services/orderService.js`
  - totals
  - GST
  - KG conversion
  - line item calculations
- `src/repositories/orderRepository.js`
  - local order CRUD
- `src/services/orderSyncService.js`
  - queue / pending sync helpers
- `src/pdf-export.js`
  - order PDF generation

## Shops / route operations
- `src/views/shopsView.js`
  - route shop cards
  - admin shop UI
  - route override modal
  - area schedule modal/sections
- `src/features/shops/shopsHandlers.js`
  - shop add/edit/import
  - GPS reset
  - route override actions
  - area schedule actions
- `src/services/shopService.js`
  - import logic
  - area/day helpers
  - shop validation
- `src/services/gpsService.js`
  - geolocation permission + capture + distance
- `src/services/mapsService.js`
  - Google Maps links
- `src/repositories/shopRepository.js`
  - local shop CRUD
- `src/repositories/routeOverrideRepository.js`
  - override CRUD
- `src/repositories/areaScheduleRepository.js`
  - area schedule CRUD

## Visit status
- `src/views/visitStatusView.js`
  - admin/manager visit status UI
- `src/features/visit-status/visitStatusHandlers.js`
  - filters and interactions
- `src/services/visitStatusService.js`
  - checked-in / pending / productive / unproductive summary logic
  - route expectation logic
- `src/repositories/visitProofRepository.js`
  - local visit proof CRUD

## GPS route / maps
- `src/views/routesView.js`
  - GPS route tab UI
- `src/features/routes/routesHandlers.js`
  - GPS route filters
- `src/services/routeService.js`
  - visit proof grouping/timeline logic
- `src/services/routeMapService.js`
  - map drawing, marker behavior, path usage
- `supabase/functions/route-path/index.ts`
  - walking route generation via Google Routes API

## Products
- `src/views/productsView.js`
  - product list/table/form/modal
- `src/features/products/productsHandlers.js`
  - product add/edit/import/search
- `src/services/productService.js`
  - Excel import, SKU parsing, sorting
- `src/repositories/productRepository.js`
  - local product CRUD

## Targets
- `src/views/targetsView.js`
  - admin target table/modal
  - salesperson target progress cards
- `src/features/targets/targetsHandlers.js`
  - save/edit/delete target handling
- `src/services/targetService.js`
  - target progress math, KG conversion, summary logic
- `src/repositories/targetRepository.js`
  - local target CRUD

## Team / users
- `src/views/teamView.js`
  - user list, add/edit/password forms
- `src/features/team/teamHandlers.js`
  - create user, edit user, reset password requests
- `src/repositories/userRepository.js`
  - current user state + local profile updates
- `supabase/functions/admin-users/index.ts`
  - server-side user creation and password reset

## Collections
- `src/views/collectionsView.js`
  - add/edit collection modal
  - collection list
  - collection filters
  - collection payment-mode footer totals
- `src/features/collections/collectionsHandlers.js`
  - collection create/edit/delete
  - cheque date logic
  - modal amount-total block
  - payment-mode filter state handling
- `src/repositories/collectionRepository.js`
  - local collection CRUD
- `src/selectors.js`
  - `getVisibleCollections(user, appState)` applies role, salesperson, area, date, and payment-mode filters
- `src/config.js`
  - seed state includes `selectedCollectionPaymentMode`, defaulting to `all`
- `app.js`
  - passes collection payment-mode filter state into the collections view
  - delegates payment-mode filter changes to the collections handlers
- `src/pdf-export.js`
  - collection PDF generation
  - also controls collection export naming and grouped summary layout

## Cloud sync / realtime / PWA
- `src/app/cloudSync.js`
  - realtime refresh
  - deferred refresh
  - pending sync queues
  - cloud save orchestration
- `src/services/realtimeService.js`
  - Supabase channel setup
- `src/app/idleLogout.js`
  - idle/session handling
- `src/app/pwaUpdates.js`
  - PWA update/refresh handling
- `service-worker.js`
  - runtime cache behavior
- `public/service-worker.js`
  - service worker source for deployment

---

## 9. Reusable Components

There are no framework components, but there are reusable template blocks and UI patterns.

### Reusable view/template patterns
- shop card templates in `src/views/shopsView.js`
- product row templates in `src/views/productsView.js` and order screen renderers
- collection entry template in `src/views/collectionsView.js`
- modal panel structure reused across views
- table action groups reused in master screens
- summary/stat cards in targets/visit status/orders

### Reusable helper render logic
- button row structures
- compact form structures
- table wrappers
- status badges (`ADHOC`, `Updated`, GPS status, etc.)

### Reusable business utilities
- money formatting
- date formatting
- KG conversion
- PDF note normalization
- area option generation
- filtered collection/order/shop selectors

---

## 10. State Management

## Global state
All application state lives in `src/state.js`.

### Persistent state
Saved to browser localStorage:
- users
- shops
- products
- orders
- collections
- visit proofs
- targets
- route overrides
- area schedules
- filters
- active tab
- current user ID
- sync status
- pending sync queues

### Shared state patterns
- `setState` for persistent changes
- `setTransientState` for non-persistent typing/filter/UI updates
- `replaceState` for full cloud refresh replacements
- `subscribeState` for render subscriptions

`setTransientState` exists because writing every keystroke to localStorage caused performance and UX issues earlier in the project, especially with large shop/product lists.

### Offline / sync-related state
- `pendingOrderSyncs`
- `pendingVisitProofSyncs`
- per-order `syncState`
- per-order `syncError`
- `syncStatus`
- `lastSyncedAt`

### Caching / refresh behavior
- local state is the current working model
- Supabase refresh replaces/merges state
- pending local unsynced orders are preserved during cloud refresh
- realtime subscriptions trigger refreshes
- silent refresh behavior exists to reduce UI rollback issues

---

## 11. Coding Conventions

### General style
- plain JavaScript ES modules
- no TypeScript in frontend
- backend Edge Functions use TypeScript/Deno
- readability over abstraction-heavy patterns
- feature handlers + service layer + repository separation

### Naming conventions
- files:
  - `camelCase.js` for most modules
  - `*Handlers.js` for feature event handlers
  - `*Service.js` for business/service logic
  - `*Repository.js` for local entity CRUD
  - `*View.js` for HTML templates
- state fields:
  - camelCase
- DB mapping:
  - frontend camelCase
  - Supabase row mapping snake_case

### Architectural conventions
- `app.js` should orchestrate, not contain all business logic
- view modules should stay mostly render/template focused
- mutations should go through repositories
- cloud persistence should go through `supabaseDataService.js`
- derived visibility/filter logic should go in `selectors.js` or a dedicated service
- new features should preferably be added feature-first under `src/features/...`

### UI conventions
- mobile-first CSS
- restrained internal tool styling
- no heavy marketing layouts
- modal-driven CRUD where needed
- internal scroll for large lists instead of page bloat
- confirmation before destructive or important save actions
- internal admin tooling should favor dense-but-readable utility UI over decorative layouts
- visually important action/status cues:
  - orange primary actions
  - green route/order success actions
  - red updated/destructive cues
  - soft yellow summary surfaces

### Testing conventions
- business logic tests in `tests/services.test.mjs`
- use tests for:
  - totals
  - product ordering/search
  - route logic
  - visit status logic
  - PDF generation expectations
  - target calculations
  - sync merge logic

---

## 12. Environment Variables

## Frontend
### `VITE_SUPABASE_URL`
Supabase project URL.

### `VITE_SUPABASE_ANON_KEY`
Public anon key for frontend Supabase access.

---

## Edge Functions / backend secrets
### `SUPABASE_URL`
Used by Edge Functions.

### `SUPABASE_SERVICE_ROLE_KEY`
Required by:
- `admin-users`
- `route-path`

Never expose to frontend.

### `APP_ORIGIN`
Comma-separated allowed origins for Edge Function CORS.

Examples:
- production Vercel URL
- custom domain
- localhost dev URL if needed

### `LOGIN_EMAIL_DOMAIN`
Used by `admin-users` function to convert login IDs to internal auth emails.  
Default:
- `manishmasala.local`

### `GOOGLE_MAPS_API_KEY`
Required by `route-path` for Google Routes API.

---

## 13. Known Issues

1. **README is partially outdated**
   - It still references earlier/local prototype assumptions.
   - Do not rely on README alone for current features.

2. **LocalStorage fallback can still hit quota**
   - especially with large imports or prolonged offline usage
   - browser storage quota was already encountered earlier in project history

3. **Date input UI varies by device**
   - Samsung / OnePlus / desktop browsers display native date inputs differently
   - this is a browser-native behavior issue

4. **PDF generation is hand-built**
   - `src/pdf-export.js` manually writes PDF commands
   - this is powerful but brittle
   - layout changes can easily break tests or print formatting

5. **Realtime/idle/session/logout logic is sensitive**
   - there was prior instability around auto logout and broken realtime sync
   - current behavior is better, but this remains an area to modify carefully

6. **PWA cache/update behavior is delicate**
   - service worker and update logic were tuned to force new code rollout behavior
   - changes here can easily reintroduce stale-app problems

7. **Manager permissions are intentionally limited but not exhaustively formalized in a single policy doc**
   - future changes must test manager role carefully

8. **Owner field exists in DB but is removed from active UI flow**
   - avoid reintroducing it casually without checking business intent

9. **No full framework/component system**
   - maintainability depends on discipline in modular JS, not framework guardrails

10. **Collection PDF mode text/test mismatch history**
   - recent PDF changes have been tested, but PDF textual expectations are fragile

11. **Some UI copy may still be stale**
   - example: collection page descriptive text previously said PDF export is grouped by payment mode, which is no longer true after the grouped-by-shop export change

12. **Product images rely on externally reachable HTTPS URLs**
   - bad URLs or inaccessible storage objects degrade thumbnails
   - image issues usually do not block order entry, but they can hurt operator confidence

13. **Order locking after day-end is not fully implemented as a finalized hard rule**
   - discussed as a business need
   - not documented as fully completed in code here

14. **WhatsApp urgent-order automation is not implemented**
   - only discussed conceptually

15. **Start route / end route workflow is not implemented**
   - only discussed conceptually

---

## 14. Pending Features

These are either clearly requested but not completed, or conceptually identified and still open:

1. **Hard day-end lock for salesperson order editing**
   - after midnight, salesperson should not edit previous-day orders

2. **Start Route / End Route feature**
   - track start-of-day and end-of-day working sessions

3. **WhatsApp urgent order integration**
   - user asked conceptually about sending urgent order text on WhatsApp
   - not implemented

4. **Better offline sync for non-order modules**
   - orders and visit proofs got the most attention
   - collections/masters should be reviewed for offline robustness

5. **Possible stronger silent refresh strategy**
   - especially for admin long-open tabs

6. **Potential route-marker UX refinements**
   - already improved, but map marker clarity may still need iterative polish

7. **Potential tighter duplicate-prevention in rapid repeated check-ins**
   - duplicate visit proof cases occurred historically

8. **Potential better device-independent date picker UX**
   - custom date picker would be needed if native inconsistency becomes unacceptable

9. **Audit and refresh stale UI copy**
   - especially around collection PDF grouping and any old local-prototype labels

---

## 15. Future Improvements

1. **Introduce a formal client-side entity model layer**
   - still stay in JS if desired
   - would reduce row/object mapping duplication

2. **Split `app.js` further**
   - it is much smaller than before but still central and significant

3. **Move PDF generation into dedicated modules**
   - `ordersPdfBuilder`
   - `collectionsPdfBuilder`
   - test each independently

4. **Add integration tests around Supabase save flows**
   - especially order save, collections save, route overrides

5. **Improve sync queue coverage**
   - include collections and maybe shop edits when offline

6. **Introduce structured event bus or command pattern**
   - could reduce central delegated branching in `app.js`

7. **Harden duplicate check-in prevention**
   - client-side debounce + DB-side prevention strategy

8. **Add DB-side auditing/triggers for critical tables**
   - more useful use of `audit_logs`

9. **Add archived/deactivated product handling in UI**
   - current active/inactive model exists in schema but UI usage can be improved

10. **Add stronger admin diagnostics panel**
   - sync status
   - last refresh
   - pending local items
   - RLS failure visibility

11. **Create proper custom date-range picker and mobile-friendly filter controls**
   - current native inputs work but are inconsistent

12. **Consider moving to TypeScript incrementally**
   - not required, but would reduce future regression risk in this size of app

13. **Move current handoff knowledge into maintained docs**
   - this file is a snapshot handoff
   - long-term, portions should be split into maintained docs:
     - architecture
     - ops/deployment
     - database/RLS
     - product workflow rules

---

## 16. Important Decisions

1. **Chose Vite + vanilla JS instead of React/React Native**
   - user did not want store deployment
   - PWA/web approach is simpler and faster to distribute internally

2. **Chose Supabase as backend**
   - shared production database
   - auth
   - realtime
   - edge functions
   - storage support
   - low backend ops overhead

3. **Kept localStorage fallback**
   - important for local testing and resilience
   - also acts as local working copy/cache in production flows

4. **Introduced repository layer**
   - to stop all data logic from living directly in `app.js`
   - improves maintainability and future refactors

5. **Introduced feature-based modular architecture**
   - not micro frontend
   - a pragmatic feature-based modular JS architecture

6. **Removed shop board photo verification entirely**
   - business requirement changed
   - GPS-only verification kept

7. **Kept ad hoc orders separate from route orders**
   - because business workflow differs:
     - no route geofence
     - separate tag/reporting behavior
     - excluded from route timeline logic

8. **Use visit proofs, not just orders, for visit-status truth**
   - because salesperson may visit without placing order

9. **Use area-based route schedules + date-based overrides**
   - business runs by area/day, not just static salesperson->shop mapping

10. **Use raw PDF generation instead of external PDF library**
   - lightweight and direct
   - but fragile; accepted tradeoff

11. **Use Edge Function for admin user management**
   - frontend must not hold service role key
   - required for production-safe auth user creation/reset

12. **Use Google Routes API through Edge Function**
   - avoids exposing API key directly in frontend
   - allows walking route reconstruction from visit points

13. **Admin export naming now follows selected salesperson filter**
   - because “All salespeople” in a filtered export was misleading
   - if no filter selected, use `admin`

14. **Owner removed from active UI**
   - business no longer needed it consistently
   - DB field kept for compatibility

15. **Collection button gated by operational visit completion**
   - prevents collection entry before route visit is actually done

16. **Normal refresh should preserve active tab; deploy/update reset should not**
   - this distinction was explicitly required by the user after earlier regressions

---

## 17. Development Notes

1. **Do not trust old README as full truth**
   - this handoff is more current

2. **Always run after changes**
   ```bash
   npm test
   npm run build
   ```

3. **Be extremely careful with `src/pdf-export.js`**
   - many business-specific formatting rules live there
   - tests catch some regressions, not all visual ones

4. **Be careful with `app.js` delegated handlers**
   - new inputs/selects often require explicit branching in:
     - submit
     - change
     - input
     - keydown
     - keyup

5. **RLS changes are a serious production concern**
   - schema changes often require matching policy updates
   - many historical “row-level security policy” failures came from schema evolution without policy alignment

6. **If new DB columns are added**
   update all of:
   - migrations
   - `rowTo*` mapper
   - `*ToRow` mapper
   - tests
   - sometimes PDF/render logic
   - sometimes filters/selectors

7. **Realtime refresh changes must preserve active UX**
   - past issues included:
     - active tab resetting
     - scroll resetting
     - filter rollback
     - unintended logout behavior

8. **PWA update behavior should not be casually changed**
   - stale app code on mobile was a real operational issue

9. **Route override logic affects many areas**
   changing it may affect:
   - salesperson shops list
   - admin shops list
   - visit status route counts
   - GPS route expectations

10. **Visit status logic is business-critical and nuanced**
    - productive vs unproductive
    - check-in based on proofs
    - overrides
    - biweekly schedules
    - area filters
    - date/date-range filters

11. **Collections and orders PDFs have separate business rules**
    - do not unify them casually

12. **Manager role should be tested separately after any permission change**

13. **Supabase migrations list matters**
    - migrations up to `022_fix_collection_edit_delete_rls.sql` exist
    - new sessions must not assume only the early schema

14. **Do not assume README tab order or labels are current**
    - check `app.js` and view files for the live UI sequence

15. **Product image URLs**
    - should be HTTPS
    - may be blank
    - often point to public Supabase Storage objects
    - when debugging missing images, verify both the URL and bucket/object public accessibility

---

## 17A. Additional Conversation-Only Context

This section captures high-value knowledge learned through the long back-and-forth with the owner, but not always obvious from the codebase itself.

### Owner / stakeholder working style
1. The owner is not technical and judges the app primarily through:
   - real Android mobile usage
   - installed PWA behavior
   - printed PDFs
   - operational speed in the field

2. Explanations should stay practical. Architecture changes are acceptable only if:
   - existing behavior is preserved
   - mobile workflow does not get slower
   - live order capture becomes safer, not riskier

3. The owner is highly sensitive to:
   - accidental data loss
   - sync failures
   - layout bulkiness
   - extra taps
   - wasted white space
   - device-specific behavior differences

### Business rules that are easy to miss
4. A salesperson's effective route for a day is determined by a combination of:
   - normal weekday area schedule
   - biweekly / 15-day area schedule
   - temporary route override for a specific date

5. Route overrides are temporary day-scoped reassignment only, not permanent shop ownership transfer. When the date changes, normal assignment is expected to apply again automatically.

6. Salespeople must actually see overridden shops in `My Shops` on the overridden date. This was a real defect earlier and is a critical expectation.

7. New shop creation is intentionally permissive:
   - both admin and sales can add new shops
   - area selection should be a real dropdown, not a suggestion field
   - duplicate shop names must be blocked case-insensitively
   - owner name / phone / address may be unknown and should not block shop creation

8. `Owner` is no longer part of the active business workflow. The DB field may still exist, but UI and operational logic should treat it as deprecated unless the owner explicitly revives it.

9. `Visit Day` is not intended to be shown in normal shop forms. Day assignment should come from scheduling/area logic rather than daily manual input.

10. Some areas are serviced biweekly rather than daily/weekly. Visit Status must therefore be interpreted against scheduling logic, not simply "all assigned shops every selected day."

### GPS / visit semantics
11. The first GPS save for a shop is especially important because it becomes the geofence anchor. If that first save is wrong, admin must be able to reset GPS for the shop.

12. A saved GPS coordinate on the shop master does not mean the salesperson completed that day's visit. Historical confusion came from mixing:
   - shop anchor coordinates
   - date-scoped visit proofs
   - order records

13. Visit Status truth source should be date-scoped visit proofs plus route logic, not shop master GPS fields alone and not order rows alone.

14. The owner explicitly wanted a `No Order` path that still counts as a visited shop/check-in outcome for reporting.

15. Intended productive/unproductive semantics from the conversation:
   - productive visit = salesperson visited and placed an order
   - unproductive visit = salesperson visited and completed `No Order`

16. Adhoc orders are intentionally different from route orders:
   - allowed outside normal route constraints
   - geofencing should not block them the same way route orders are blocked
   - must be tagged clearly for admin and exports
   - should not contaminate normal route/timeline analytics the same way route visits do

17. Adhoc collections are also required. Collections are not route-only.

18. `Get Direction` exists as a field-operations helper so staff can navigate quickly to saved shop coordinates. It is not meant to become a full navigation subsystem.

### Order flow assumptions
19. The order-entry screen is deliberately based on directly visible product cards without per-product `Add` buttons. This was a deliberate field-speed usability change.

20. Product search in order entry must work for both:
   - visible product name
   - hidden SKU code aliases
   Example used repeatedly by the owner: typing `HP` should surface Haldi products.

21. Order quantity is always in pieces, not KG. KG is derived helper information. This distinction matters across:
   - order entry
   - confirmation screen
   - view order
   - targets
   - sold-KG visit metrics

22. The intended confirmation mental model is:
   - screen 1: add/change quantities
   - screen 2: review only selected items plus free/replacement notes
   - `Previous` returns to quantity editing
   - final submit happens only from confirmation screen

23. Pressing `Enter` in quantity inputs must not accidentally trigger next-step navigation or submission.

24. `Adhoc Order` exists because salespeople can receive urgent phone orders outside the planned route. It is not just a UI duplicate of route ordering.

25. `Updated` orders are still route orders operationally. They should be visually tagged, but should not be treated like adhoc orders in route semantics.

26. A historical network disruption produced duplicate/empty orders with the same timestamp/shop. Any future order submission refactor is high-risk and must be tested against retry/duplicate scenarios.

27. The owner's strongest requirement is that orders must never be silently lost. If the app cannot sync due to a true backend/policy/schema problem, it should fail loudly and not pretend the order is safe.

### Collections-specific nuances
28. Collection is not just a simple payment log. It is intentionally tied to a shop visit context, which is why unlock behavior matters.

29. For route shops, `GPS saved` alone should not unlock collection. Unlock should happen only after:
   - successful order submit, or
   - confirmed `No Order`

30. Bill date in collections refers to historical bill date and can be past-dated. Cheque date is different:
   - visible only when payment mode is cheque
   - allowed to be past or future dated

31. Collection PDF requirements are intentionally business-specific:
   - grouping by shop, not by payment-mode section
   - multiple rows for one shop may still share one serial number
   - per-shop total is amount-only
   - final footer totals should still show cash / UPI / cheque separately
   - expected payment abbreviations are `csh`, `chq`, `UPI`

32. The "Amount to be collected" block in the collection modal should remain simple: sum of `Amount` only. Do not silently mix in discount or replacement math.

### PDF/reporting expectations
33. PDF output is a real printed operational artifact, not a secondary feature. The owner inspects:
   - line darkness
   - readability on paper
   - density/compactness
   - how many boxes fit on a page
   - how cleanly shop names wrap

34. Orders PDF is currently tuned toward A5 printing expectations. Typography or spacing changes can have direct operational impact.

35. In Orders PDF, route orders should come first and adhoc orders should be pushed to the end.

36. Orders PDF continuation behavior should ideally mean:
   - continuation marker only when content crosses to a new page
   - not for same-page next-column flow
   - continuation text can live in the header
   - avoid awkward unused space where possible

37. For Orders and Collections PDFs exported by admin:
   - if salesperson filter is selected, subtitle and filename should use that salesperson
   - if no salesperson filter is selected, use `admin`

38. The owner repeatedly asked for denser and darker print output. Light borders or low-contrast typography are likely to be rejected.

### Mobile UX preferences
39. The owner consistently prefers compact, dense mobile UI over decorative spacing.

40. Large internal scroll regions were a recurring complaint on mobile. Preferred pattern:
   - mobile: more full-page scroll
   - tablet/desktop: internal scroll is more acceptable

41. The owner is especially sensitive to:
   - buttons wrapping badly
   - text fields overflowing cards
   - quantity boxes being too narrow
   - product names truncating too aggressively
   - scroll containers making it hard to return to filters/header

42. "Visually appealing" in this project still means operational, dense, and usable. It does not mean marketing-style hero layouts or decorative card-heavy UI.

43. The Manish brand direction the owner responded to was:
   - warm yellow/orange accents
   - compact panels
   - restrained animation
   - practical readability first

### Realtime / session / offline history
44. Realtime and auto-refresh behavior caused repeated regressions earlier:
   - active tab resetting to first tab
   - scroll jumping to top
   - filters collapsing or rolling back
   - mobile panels collapsing while the user worked
   - accidental logout loops

45. The owner originally asked for aggressive logout on connection break, but later this became a problem. The practical expectation now is:
   - do not log users out aggressively just because realtime reconnects/stalls
   - preserve unsynced work
   - recover/retry silently where possible
   - fail loudly only on real non-recoverable backend/policy problems

46. The owner's real concern was not logout by itself. It was:
   - stale admin data after the app sat idle
   - salesperson work not reaching Supabase
   - double work after reconnect

47. `Realtime connection failed` toasts should be treated carefully. Removing the toast alone is not a solution if silent data-loss risk remains.

48. The owner tests both localhost/browser behavior and installed PWA behavior. Those are not interchangeable. PWA update/logout/cache behavior can differ materially from browser refresh behavior.

49. Normal reload and deploy/update behavior are intentionally different:
   - normal reload should preserve current active tab/context
   - app update/deploy should return users to clean startup/default tab behavior

50. There was a recurring historical issue where long-idle sessions stopped syncing, and the user only noticed after returning to the app. That pain explains why reconnect/session behavior is a very sensitive area.

### RLS / Supabase lessons learned
51. Schema evolution and RLS drift caused repeated production-like failures when adding fields such as:
   - product image URL
   - replacement notes
   - targets
   - collections
   - manager role

52. A recurring pattern from the conversation:
   if a feature works locally but fails against Supabase with `new row violates row-level security policy`, the first suspect is missing migration/policy alignment, not frontend logic.

53. Optional DB columns are not harmless from an RLS perspective. Even optional new fields can expose missing policy/mapping paths.

54. Practical rule for "do I need to run SQL for this?":
   - frontend-only UI change: usually no
   - schema/policy/trigger/function/new table change: yes
   - migration exists but has not been run remotely: production may partially break even if local code looks correct

55. Clearing master data can surface relational problems:
   - deleting products can fail due to `order_items` foreign keys
   - deleting users can conflict with Supabase Auth identities/emails
   Destructive admin utilities should be handled with care.

### Date/time/device quirks
56. The owner wants `dd-mm-yyyy` conceptually throughout the app and exports, but native date input rendering varies by device/browser. Distinguish:
   - stored values
   - formatted display labels
   - native control rendering quirks

57. Samsung, OnePlus, and desktop browsers did not present date inputs the same way during testing. A date complaint is not always a CSS issue.

58. Time filters were added because the owner actively slices operations by time of day. They are not cosmetic.

### Things discussed but intentionally deferred or unresolved
59. A hard "salesperson cannot edit yesterday's order after midnight" rule was requested conceptually, but should be treated as not fully settled unless validated in code and production behavior.

60. Start Route / End Route workflow was discussed as a future operational feature, but remained at the idea/design stage.

61. WhatsApp urgent-order notification ideas were discussed conceptually, but no full production integration was finalized.

62. The owner sometimes asks for password visibility/edit UX from admin screens. Future developers should remember that showing a current password is not valid secure behavior; solve with reset flows rather than plain-text retrieval.

### Practical debugging hints
63. If route or visit counts look wrong, check all of these before assuming a math bug:
   - area schedule rules
   - biweekly eligibility
   - selected date/date range
   - route override records
   - visit proofs
   - adhoc inclusion/exclusion logic
   - salesperson filter vs all-salespeople aggregate path

64. If a salesperson says a shop is missing, verify:
   - original salesperson assignment
   - today's weekday/biweekly schedule
   - active route override for that date
   - current area filter
   - search text

65. If GPS route/admin map is missing expected points, verify whether the system wrote:
   - shop anchor coordinates only, or
   - actual visit proof rows for that day
   These are not the same thing.

66. If PDF output "looks broken," the owner usually means one of these:
   - too much white space
   - borders/text too light for printing
   - continuation behavior is confusing
   - important labels wrap unnecessarily
   - too few boxes fit on a page

67. If a future developer touches order submission, collection submission, visit-proof writes, session recovery, or service worker update logic, treat it as production-sensitive even if the code diff is small.

## 18. Current TODO List

## Priority 1
1. Implement hard day-end order edit lock for salespeople.
2. Review and harden offline/online sync behavior for critical order flows end-to-end.
3. Verify production RLS coverage whenever any schema changes are introduced.
4. Keep admin/manager long-open session refresh behavior stable without accidental logout loops.
5. Fix any stale UI copy that still contradicts live business logic (especially collection PDF description).

## Priority 2
6. Implement Start Route / End Route workflow if business confirms.
7. Improve offline/resync behavior for collections and possibly master edits.
8. Add better duplicate-visit-proof prevention for repeated taps/check-ins.

## Priority 3
9. Consider splitting PDF generation into separate modules.
10. Improve admin diagnostics around sync/realtime status.
11. Build a more device-consistent date filter UX if native input behavior becomes a business problem.

## Priority 4
12. Consider progressive TypeScript adoption.
13. Improve audit logging usefulness.
14. Document manager permissions more formally in code/docs.
15. Review and possibly modernize service worker caching strategy after any major deployment issue.

---

## 19. Quick Start for Future Codex Sessions

Read this first before making changes:

### What this project is
A production-style internal PWA for Manish Masala.  
It handles:
- shop routing
- GPS-based visit verification
- route and ad hoc orders
- collections
- targets
- route overrides
- visit status
- admin/manager reporting
- Supabase-backed auth/data/realtime

### What the architecture is
This is **not React**.  
It is a modular vanilla-JS SPA with:

- `app.js` as orchestrator
- `src/views/*` for HTML templates
- `src/features/*` for event/workflow handlers
- `src/services/*` for business logic and Supabase integration
- `src/repositories/*` for local entity CRUD
- `src/state.js` for global state and persistence

### Where to look first
- Main orchestration:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\app.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/app.js)

- Global state:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\state.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/state.js)

- Cloud integration:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\services\supabaseDataService.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/services/supabaseDataService.js)

- Selectors / derived filters:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\selectors.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/selectors.js)

- PDF generation:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\pdf-export.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/pdf-export.js)

- Shop feature:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\features\shops\shopsHandlers.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/features/shops/shopsHandlers.js)

- Order feature:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\views\ordersView.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/views/ordersView.js)  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\features\orders\orderReview.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/features/orders/orderReview.js)

- Collections feature:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\views\collectionsView.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/views/collectionsView.js)  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\features\collections\collectionsHandlers.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/features/collections/collectionsHandlers.js)

- Visit status logic:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\src\services\visitStatusService.js](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/src/services/visitStatusService.js)

- Tests:  
  [C:\Users\varun\OneDrive\Documents\MM-sales-order-app\tests\services.test.mjs](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/tests/services.test.mjs)

### What to be careful about
1. Do not break RLS assumptions.
2. Do not casually modify service worker/PWA update behavior.
3. Do not treat visit status as order-only; it depends on visit proofs.
4. Do not remove repository/service separation by pushing logic back into `app.js`.
5. Do not change export naming/PDF logic without re-running tests and visually checking a generated PDF.
6. If adding a DB field, update migrations + mappers + tests.
7. Manager role is view-heavy and must be tested separately.
8. Active-tab and scroll-preservation behavior is deliberate; realtime or rerender changes can easily regress it.
9. Collection unlock rules are stricter than plain GPS availability for route shops.
10. README and some inline UI copy may lag behind the real implementation; verify against code before relying on labels.

### Minimum validation after any change
```bash
npm test
npm run build
```

### Environment required for production work
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Supabase Edge Function secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `APP_ORIGIN`
  - `LOGIN_EMAIL_DOMAIN`
  - `GOOGLE_MAPS_API_KEY`

### Current production-oriented migration set
Migrations currently present:
- `001_initial_schema.sql`
- `002_add_product_photo_url.sql`
- `003_add_order_replacement_notes.sql`
- `004_fix_order_insert_rls.sql`
- `005_add_sales_targets.sql`
- `006_fix_sales_targets_rls.sql`
- `007_fix_products_rls.sql`
- `008_reset_app_rls_policies.sql`
- `009_add_manager_role.sql`
- `010_enable_realtime.sql`
- `011_enable_visit_proofs_realtime.sql`
- `012_save_order_with_items_rpc.sql`
- `013_production_rls_and_order_sync_patch.sql`
- `014_add_route_overrides.sql`
- `015_allow_route_override_shop_access.sql`
- `016_add_user_geofence_meters.sql`
- `017_add_area_route_schedules.sql`
- `018_add_collections.sql`
- `019_add_visit_proof_type.sql`
- `020_add_collection_type.sql`
- `021_add_collection_cheque_date.sql`
- `022_fix_collection_edit_delete_rls.sql`

### Current direction for future work
The project should continue in the same architecture:
- feature-based modular JS
- Supabase-backed production mode
- strong business-rule tests
- careful PDF/business-flow updates
- minimal UI regression risk
- no large framework rewrite unless explicitly approved by business/owner

### Current operational semantics worth remembering
- admin/manager default start tab: `orders`
- sales default start tab: `shops`
- normal reload should preserve active tab
- deploy/update reset should bring users back to default start behavior
- mobile scroll is more page-oriented; desktop/tablet retains more internal scroll zones
- product image URLs are optional but must be HTTPS when supplied
- collection PDF is grouped by shop, not by payment mode sections

---

## 20. Next.js Rebuild Start

On 2026-07-08, an in-place rebuild foundation was started using:
- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- Supabase SSR helpers
- Supabase JS
- jsPDF / jsPDF AutoTable
- lucide-react
- zod

The legacy vanilla/Vite application files were later removed from this branch because the original implementation remains available on `main` and `dev`. Use `AI_CONTEXT.md`, Supabase migrations/functions, and the old branches as the parity reference while modules are ported. The first Next pass added:
- `app/` route structure with `/login`, `/admin`, `/manager`, and `/sales`
- shared role dashboard shell preserving current business tab order
- Supabase browser/server client helpers
- navigation constants for admin/manager and sales tabs
- TypeScript, Next, and PostCSS configuration
- Tailwind global CSS using conventional utility-scale design

Tailwind implementation direction for the rebuild:
- prefer standard utility classes such as `p-2`, `gap-4`, `rounded-md`, and `text-sm`
- avoid arbitrary values like `p-[7px]` unless the layout truly requires exact custom sizing
- keep the UI compact, dense, mobile-first, and operational rather than decorative

Validation after the foundation pass:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

### Auth foundation update
The Next rebuild now includes Supabase auth/session plumbing:
- `/login` is a server page that redirects already-authenticated active profiles to the correct dashboard
- `app/login/login-form.tsx` signs in with Supabase email/password using the existing login ID email mapping
- `lib/auth/profile.ts` loads the current `profiles` row and maps it into `UserProfile`
- `lib/auth/routing.ts` centralizes role-to-dashboard routing
- `/admin`, `/manager`, and `/sales` are server-protected by exact role
- wrong-role dashboard access redirects to the user's own dashboard
- inactive, missing, or invalid-role profiles are not allowed into the dashboard
- `proxy.ts` refreshes Supabase auth cookies for App Router requests
- `components/auth/sign-out-button.tsx` signs out and returns users to `/login`

### Sales My Shops route slice
The Next rebuild includes the first sales route feature:
- `services/sales-shops.ts` fetches route shops for the logged-in salesperson
- it uses `shops`, `area_route_schedules`, `route_overrides`, and `visit_proofs`
- route inclusion respects:
  - due weekly schedules
  - due biweekly schedules
  - same-day route override areas
  - fallback `shops.visit_day` for assigned shops when schedule rows are missing
- `features/sales/my-shops.tsx` renders:
  - route summary counts
  - area/search/GPS filters
  - GPS saved/pending status
  - visit outcome status from today's visit proofs
  - Google Maps direction links when shop GPS exists
- Sales tabs are individual routes, not hash anchors:
  - `/sales`
  - `/sales/adhoc-order`
  - `/sales/orders`
  - `/sales/collections`
  - `/sales/targets`
- `/sales` renders My Shops inside the shared dashboard shell.

### Sales check-in slice
The Next rebuild now includes active sales check-in:
- `features/sales/check-in.ts` captures browser geolocation with high accuracy
- first check-in for a shop saves `shops.location_lat`, `location_lng`, `location_accuracy`, and `location_captured_at`
- every check-in inserts a `visit_proofs` row with:
  - `shop_id`
  - `sales_person_id`
  - latitude/longitude/accuracy
  - `distance_meters` when a shop GPS anchor already exists
  - `visit_type = 'check_in'`
  - `captured_at`
- `lib/gps/distance.ts` calculates Haversine distance in meters
- `features/sales/my-shops.tsx` uses a Visit Shop button, not separate Check in and Order buttons
- Visit Shop confirms first GPS anchor save when needed, captures GPS, enforces the user geofence from `profiles.geofence_meters` when shop GPS exists, and opens the product order modal
- No Order captures GPS and enforces the same user geofence before marking no-order
- invalid out-of-radius attempts must not save local visit records
- location permission errors and Supabase write failures are shown inline on the shop card

Temporary database safety mode:
- `NEXT_PUBLIC_APP_DATA_MODE=local` is the default expected mode for this rebuild branch
- local mode uses demo login IDs `admin`, `manager`, and `sales`; any password is accepted
- local mode avoids Supabase Auth and protected routes use a local profile cookie
- `NEXT_PUBLIC_APP_DATA_MODE=supabase` with `NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled` is the supported live read-only mode for comparing against production data
- live read-only mode shows Supabase data in admin, manager, and sales screens while disabling app UI paths that create, edit, update, delete, check in, mark No Order, place orders, or enter collections
- `NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled` is the default expected mode for this rebuild branch
- when disabled, check-ins are stored in localStorage under `manish-masala-next.local-checkins.v1`
- the loaded Sales My Shops route data is snapshotted to localStorage under `manish-masala-next.sales-route-snapshot.v1`
- in full local mode, `/sales` loads that local route snapshot instead of querying Supabase
- `features/sales/seed-local-route.tsx` provides a local-mode seed panel on `/sales`
- the seed panel accepts a real Supabase sales login/password, reads that salesperson route once, stores it under the local `sales` profile snapshot key, and signs out of Supabase
- this seed action is read-only for business tables
- in disabled write mode, check-ins do not update live `shops` or `visit_proofs`
- set `NEXT_PUBLIC_SUPABASE_WRITE_MODE=enabled` only when intentionally testing real Supabase check-in writes

Database change:
- `supabase/migrations/023_allow_override_shop_gps_update.sql` updates the `shops_update_admin_or_assigned` policy so same-day override route shops can also save GPS anchors. Without this migration, override shops may be visible but first GPS anchor save can fail for sales users.

### Sales No Order local slice
The Next rebuild now includes local-only No Order:
- `features/sales/check-in.ts` stores local visit records with `visitType = 'check_in' | 'no_order'`
- legacy local check-ins under `manish-masala-next.local-checkins.v1` are still read and treated as check-ins
- active local visit records are stored under `manish-masala-next.local-visit-proofs.v1`
- `features/sales/my-shops.tsx` lets No Order run the same GPS/geofence check as Visit Shop
- marking No Order updates the card outcome and route summary counts immediately
- Collection activates for route shops after either successful order save or confirmed No Order
- No Order asks for confirmation before saving
- Supabase is not written in local mode

### Sales local route and adhoc order slice
The Next rebuild now includes local-only route and adhoc order entry:
- `lib/local/products.ts` seeds active products and SKUs from Supabase into `manish-masala-next.local-product-skus.v1`
- `lib/local/shops.ts` seeds all shops from Supabase into `manish-masala-next.local-shops.v1`
- local shop seed remaps shops assigned to the real seeded Supabase salesperson onto the local demo sales profile so adhoc visibility remains salesperson-scoped
- `features/sales/seed-local-route.tsx` now seeds route data, all shops, product/SKU data, and sales targets
- `features/sales/local-order-entry.tsx` provides:
  - product/SKU search
  - quantity in pieces
  - KG helper from SKU size when parseable
  - live line amount on product cards
  - notes and replacement notes
  - review step
  - subtotal, GST 5%, and grand total
  - local order save
- order save/update asks for confirmation
- `features/sales/adhoc-order.tsx` lets salespeople select assigned seeded shops and create an `adhoc` order outside today's planned route
- adhoc order captures current GPS for the order payload without route geofence blocking
- `lib/local/orders.ts` stores orders under `manish-masala-next.local-orders.v1`
- local order records include `visitLat`, `visitLng`, `visitAccuracy`, and `visitCapturedAt` for later Supabase `orders.visit_*` mapping
- route order entry starts through the Visit Shop button after GPS/geofence validation
- saving a local route order marks the shop outcome as `order_started`
- route orders save with `orderType = 'route'`
- adhoc orders save with `orderType = 'adhoc'`
- Supabase is not written

### Sales local My Orders slice
The Next rebuild now includes a local My Orders screen:
- `features/sales/my-orders.tsx` reads local orders from `manish-masala-next.local-orders.v1`
- the Sales dashboard renders My Shops and My Orders through `features/sales/sales-local-dashboard.tsx`
- saved local orders show:
  - shop name
  - created date/time
  - item count
  - grand total
  - adhoc tag when `orderType = 'adhoc'`
  - updated tag when `status = 'updated'`
  - order detail modal
  - notes and replacement notes
  - subtotal, GST, and grand total
- local orders can be edited by reopening `LocalOrderEntry` with existing quantities, notes, and replacement notes
- salesperson local order edit is limited to today's orders
- edited local orders preserve the same order id and created timestamp, and save with status `updated`
- local order delete asks for confirmation before removing from localStorage

### Sales local Collections slice
The Next rebuild now includes local route and adhoc Collections:
- `lib/local/collections.ts` stores collections under `manish-masala-next.local-collections.v1`
- `features/sales/local-collection-entry.tsx` provides:
  - multi-row bill entry
  - bill date
  - bill number
  - amount
  - discount
  - replacement
  - payment mode
  - cheque date only when payment mode is cheque
  - amount-to-be-collected total from Amount fields only
- `features/sales/collections.tsx` renders:
  - eligible route/adhoc shop picker
  - collection bill-row table
  - search, area, created-date, and payment-mode filters
  - cash, cheque, and UPI amount-only totals for visible bill rows
  - edit and delete controls
- route collection unlock currently requires local `order_started` or `no_order`
- adhoc collection can be created for any seeded shop without requiring an adhoc order first
- collection save/update/delete asks for confirmation
- edited local collections preserve the same collection id and created timestamp, and save with status `updated`
- Supabase is not written

### Sales local Targets slice
The Next rebuild now includes local salesperson target progress:
- `lib/local/targets.ts` stores target rows under `manish-masala-next.local-sales-targets.v1`
- `features/sales/seed-local-route.tsx` seeds `sales_targets` rows for the real Supabase salesperson and remaps them to the local demo sales profile
- `features/sales/targets.tsx` renders:
  - overall target KG
  - overall completed KG
  - overall pending KG
  - circular progress indicator
  - SKU-level target cards
  - target / completed / pending KG
  - date range
  - progress percentage and message
- completed KG is calculated from local order item pieces multiplied by target grams, then divided by 1000
- only matching SKU ids count toward a target
- only orders created inside the target date range count
- route and adhoc local orders both count when SKU/date match
- overall completed KG is capped per target so one overachieved SKU cannot cover another pending SKU
- salesperson target view is read-only
- Supabase is not written

### Admin/Manager local Orders slice
The Next rebuild now includes local admin/manager Orders review:
- `features/admin/orders.tsx` reads local orders from `manish-masala-next.local-orders.v1`
- shop lookup uses `manish-masala-next.local-shops.v1`
- `/admin` renders Orders with admin mutation controls
- `/manager` renders Orders as read-only for mutation
- summary cards show:
  - today's orders
  - updated today
  - adhoc today
  - visible filtered value
- filters include:
  - salesperson
  - area
  - exact date
  - date from
  - date to
  - time from
  - time to
  - search
- order table shows status tags, shop/area, salesperson id, date/time, item summary, value, and actions
- order detail modal shows item rows, notes, replacement notes, subtotal, GST, grand total, and visit map link when local order GPS exists
- visible filtered orders can be exported to PDF with `jspdf` and `jspdf-autotable`
- admin can edit/delete local orders after confirmation
- manager can view order details and map links but cannot edit/delete
- Supabase is not written

### Admin/Manager local Collections slice
The Next rebuild now includes local admin/manager Collections review:
- `features/admin/collections.tsx` reads local collections from `manish-masala-next.local-collections.v1`
- shop lookup uses `manish-masala-next.local-shops.v1`
- `/admin` renders Collections with admin mutation controls
- `/manager` renders Collections as read-only for mutation
- summary cards show:
  - today's collections
  - updated today
  - adhoc today
  - visible filtered amount
- filters include:
  - salesperson
  - area
  - payment mode
  - collection type
  - exact date
  - date from
  - date to
  - time from
  - time to
  - search
- collection table shows status tags, shop/area, salesperson id, bill details, payment mode, amount, discount, replacement, created date/time, and actions
- collection detail modal shows every bill row in the selected collection plus amount, discount, and replacement totals
- visible rows include amount-only cash, cheque, and UPI totals
- visible collection bill rows can be exported to PDF with `jspdf` and `jspdf-autotable`
- admin can edit/delete local collections after confirmation
- manager can view collection details and export PDF but cannot edit/delete
- Supabase is not written

### Admin/Manager local Visit Status slice
The Next rebuild now includes local admin/manager Visit Status:
- `features/admin/visit-status.tsx` reads local visit proofs through `readLocalVisitRecords`
- local proofs come from `manish-masala-next.local-visit-proofs.v1`, with legacy local check-ins merged by the existing sales check-in helper
- local route orders are used as productive visit evidence for the selected date
- visit rows are classified as:
  - pending
  - checked in
  - productive
  - unproductive
- filters include:
  - selected date
  - salesperson
  - area
  - status
  - search
- cards show expected, completed, productive, unproductive, and pending counts
- row detail shows check-in time, order-started time, No Order time, distance, route order value, and map link when GPS exists
- in temporary local mode, expected rows are based on locally seeded assigned shops because full historical route schedule snapshots for every salesperson are not yet local
- Supabase is not written

### Admin/Manager local Targets slice
The Next rebuild now includes local admin/manager Targets:
- `features/admin/targets.tsx` reads target rows from `manish-masala-next.local-sales-targets.v1`
- progress uses the same SKU-specific calculation as salesperson Targets:
  - order item pieces x target grams / 1000
  - only matching SKU ids count
  - only orders inside the target date range count
  - completed KG is capped per target for summary totals
- filters include salesperson and search
- product/SKU options for target creation come from `manish-masala-next.local-product-skus.v1`
- `lib/local/targets.ts` now supports local build/upsert/delete helpers
- admin can add/edit/delete local target rows after confirmation
- manager can review target progress but cannot mutate targets
- Supabase is not written

### Admin/Manager local Shops slice
The Next rebuild now includes local admin/manager Shops:
- `features/admin/shops.tsx` reads shop rows from `manish-masala-next.local-shops.v1`
- filters include:
  - area
  - salesperson
  - GPS status
  - search
- rows show:
  - shop name, area, phone, and address
  - assigned salesperson id
  - GPS saved/pending status
  - GPS coordinates when present
  - route reason
  - override flag
  - map link when GPS exists
- `lib/local/shops.ts` now supports local upsert/delete helpers
- admin can add/edit/delete local shops after confirmation
- manager can review shops but cannot mutate them
- Supabase is not written

Next recommended implementation step:
- continue hardening live Supabase reads and protected sync writes with targeted QA before production cutover.

### Admin/Manager individual route split
Admin and manager tabs are now individual pages instead of one long page:
- Orders remains the default:
  - `/admin`
  - `/manager`
- Collections:
  - `/admin/collections`
  - `/manager/collections`
- Visit Status:
  - `/admin/visit-status`
  - `/manager/visit-status`
- Targets:
  - `/admin/targets`
  - `/manager/targets`
- Shops:
  - `/admin/shops`
  - `/manager/shops`
- Products:
  - `/admin/products`
  - `/manager/products`
- GPS Route:
  - `/admin/gps-route`
  - `/manager/gps-route`
- Users:
  - `/admin/users`
  - `/manager/users`
- `components/layout/role-dashboard.tsx` now routes admin/manager nav links to those pages

### Admin/Manager local Products slice
The Next rebuild now includes local admin/manager Products:
- `features/admin/products.tsx` reads product/SKU rows from `manish-masala-next.local-product-skus.v1`
- `lib/local/products.ts` supports local SKU upsert/delete helpers
- filters include:
  - product
  - search
- rows show:
  - product name
  - image URL
  - SKU size
  - SKU code
  - rate
  - MRP
- admin can add/edit/delete local SKU rows after confirmation
- manager can review products but cannot mutate them
- Supabase is not written

### Admin/Manager local GPS Route slice
The Next rebuild now includes local admin/manager GPS Route:
- `features/admin/gps-route.tsx` reads local visit proofs through `readLocalVisitRecords`
- filters include:
  - date
  - salesperson
  - search
- route timeline rows show:
  - sequence number
  - shop name
  - area
  - salesperson id
  - visit type
  - captured time
  - distance from shop GPS when available
  - GPS coordinates when available
  - map link when coordinates exist
- full route reconstruction with paths remains a Supabase/go-live follow-up
- Supabase is not written

### Admin/Manager local Users slice
The Next rebuild now includes local admin/manager Users:
- `features/admin/users.tsx` reads local users from `manish-masala-next.local-users.v1`
- `lib/local/users.ts` provides default demo users and local user upsert helpers
- filters include:
  - role
  - active/inactive status
  - search
- rows show:
  - full name
  - login id
  - role
  - geofence meters
  - active/inactive status
- admin can add/edit/activate/deactivate local users after confirmation
- manager can review users but cannot mutate them
- this intentionally does not create Supabase Auth users, reset passwords, or change live access
- Supabase is not written

### Admin local Data Tools slice
The Next rebuild now includes local admin Data Tools:
- `/admin/data-tools` renders `features/admin/data-tools.tsx`
- `lib/local/app-data.ts` defines local app data sections and storage keys
- export downloads a JSON file containing:
  - orders
  - collections
  - visit proofs
  - legacy check-ins
  - products/SKUs
  - shops
  - targets
  - users
  - sales route snapshot
- import accepts only versioned Manish Masala local data JSON
- import can restore selected sections only
- reset can remove selected sections only
- actions affect browser localStorage only
- Supabase is not read or written

### Supabase read mappers and sync boundary
The Next rebuild now uses direct Supabase read mappers and protected sync functions:
- `lib/repositories/supabase-read.ts` provides Supabase mappers for:
  - shops
  - products/SKUs
  - sales targets
  - orders with order items
  - collections
  - visit proofs
  - profiles
- `lib/sync/*` owns writes for orders, order items, visit proofs, and collections, including offline replay
- `lib/local/*` remains the browser fallback layer for local pending data
- this boundary keeps core transactional writes centralized so order, visit-proof, collection, and order-item data are not lost during sync or network failures

### Admin Go-Live Audit slice
The Next rebuild now includes an admin-only Go-Live Audit:
- `/admin/go-live-audit` renders `features/admin/go-live-audit.tsx`
- `lib/go-live/audit.ts` checks:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_APP_DATA_MODE`
  - `NEXT_PUBLIC_SUPABASE_WRITE_MODE`
  - adapter readiness
  - users/auth live-write blocker
  - Visit Status expected-route wiring status
- the page lists required production table mappings
- it is read-only and does not query or write Supabase

### Production Visit Status route expectation service
The Next rebuild now includes the production route expectation service:
- `services/visit-status.ts` exports `getProductionVisitStatusForSalesperson`
- it reuses `getSalesRouteData`, which already handles:
  - `area_route_schedules`
  - route overrides
  - biweekly schedules
  - assigned/visit-day fallback
  - date-scoped visit proofs
- it reads same-day non-cancelled route orders as productive evidence
- it classifies rows as:
  - pending
  - checked in
  - productive
  - unproductive
- current admin Visit Status UI still uses local assigned-shop approximation until read-adapter QA is complete
