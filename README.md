# Manish Masala Sales Order App

Next.js rebuild branch for the Manish Masala internal sales operations PWA.

This branch intentionally contains only the new Next/React foundation plus shared backend and public assets. The old vanilla/Vite frontend files were removed from this branch because the original app remains available on `main` and `dev`.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- Supabase SSR helpers
- Supabase JS
- jsPDF / jsPDF AutoTable
- lucide-react
- zod

## Run Locally

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is already in use:

```powershell
npx next dev -H 0.0.0.0 -p 3002
```

## Environment

Create `.env.local` with:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
NEXT_PUBLIC_APP_DATA_MODE=local
NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled
```

`NEXT_PUBLIC_APP_DATA_MODE=local` is the default safety mode for this rebuild branch. It uses local demo sessions instead of Supabase Auth.

For live read-only testing against Supabase, use:

```text
NEXT_PUBLIC_APP_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled
```

This shows live Supabase data through the admin, manager, and sales screens while disabling create, edit, update, delete, check-in, No Order, order, collection, product, shop, target, and user mutations in the app UI.

Local demo login IDs:

```text
admin
manager
sales
```

Any password is accepted in local mode.

`NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled` prevents app write flows from touching live Supabase data.

## Current Routes

- `/login`
- `/admin`
- `/admin/collections`
- `/admin/visit-status`
- `/admin/targets`
- `/admin/shops`
- `/admin/products`
- `/admin/gps-route`
- `/admin/users`
- `/admin/data-tools`
- `/admin/go-live-audit`
- `/manager`
- `/manager/collections`
- `/manager/visit-status`
- `/manager/targets`
- `/manager/shops`
- `/manager/products`
- `/manager/gps-route`
- `/manager/users`
- `/sales`

`/login` authenticates with Supabase using the existing login ID convention:

```text
login.id -> login.id@manishmasala.local
```

After login, the app loads `profiles.role` and redirects to the matching dashboard. Dashboard routes are server-protected and redirect users away from the wrong role route.

The dashboard routes currently provide the rebuild shell and preserve the required business tab order. Feature modules still need to be ported from the existing app behavior.

The sales dashboard now includes the first real feature slice:

- each Sales tab is an individual route:
  - `/sales`
  - `/sales/adhoc-order`
  - `/sales/orders`
  - `/sales/collections`
  - `/sales/targets`
- today's `My Shops` route list
- weekly/biweekly area schedule filtering
- date-scoped route override areas
- area, search, and GPS filters
- GPS saved/pending status
- today's visit proof status
- Google Maps direction links when shop GPS exists
- Visit Shop with browser geolocation and per-user geofence check before opening order entry
- first-time shop GPS anchor save
- `visit_proofs` insert with distance from saved shop GPS
- automatic localStorage snapshot of the loaded sales route data

In default local write mode, visit proofs are saved only in browser localStorage.
No Order is local-only too and requires the same GPS/geofence check as Visit Shop.

Route and adhoc order entry are local-only in this branch:

- products/SKUs are seeded into localStorage by **Seed Local Route**
- all shops are seeded into localStorage by **Seed Local Route** for Adhoc Order, with the seeded salesperson mapped to the local sales user
- Visit Shop confirms first GPS anchor save when needed, checks GPS, confirms the salesperson is within their configured geofence when shop GPS exists, and then opens order entry
- No Order uses the same GPS/geofence check and then activates collection for that route shop
- Adhoc Order can be created for assigned seeded shops outside today's planned route
- Adhoc Order captures current GPS for the order payload, without route geofence blocking
- quantities are entered in pieces
- review screen shows selected items and totals
- product rows show live line amount and KG helper when SKU size can be parsed
- local orders are stored under `manish-masala-next.local-orders.v1`

The local Sales dashboard also includes My Orders:

- lists saved local route and adhoc orders
- shows order count and total value
- tags adhoc and updated orders
- opens order detail with item rows, notes, replacement notes, GST, and grand total
- edits saved local orders by reopening the order-entry modal with existing quantities and notes
- salesperson edit is limited to today's local orders
- save/update/delete actions ask for confirmation
- deletes local orders from localStorage

The local Sales dashboard also includes route and adhoc Collections:

- collection entry unlocks after route order started, confirmed No Order, or adhoc order
- adhoc collection can also be entered directly for any seeded shop without placing an adhoc order first
- multiple bill rows can be saved in one collection
- bill rows include bill date, bill number, amount, discount, replacement, payment mode, and cheque date for cheque mode
- the modal shows an amount-to-be-collected total from Amount fields only
- collection rows filter by search, area, created date, and payment mode
- cash, cheque, and UPI totals use Amount fields only
- local collections are stored under `manish-masala-next.local-collections.v1`
- saved local collections can be edited or deleted after confirmation

The local Sales dashboard also includes Targets:

- sales target rows are seeded into localStorage by **Seed Local Route**
- local targets are stored under `manish-masala-next.local-sales-targets.v1`
- progress is SKU-specific and date-bounded
- completed KG is calculated from local order item pieces x target grams
- route and adhoc orders both count when they match the target SKU and date range
- overall completed KG is capped per SKU target so one overachieved SKU does not cover another SKU's pending target
- target cards show target, completed, pending, progress percentage, and progress message

The admin and manager dashboards now include local Orders review:

- reads local route and adhoc orders from `manish-masala-next.local-orders.v1`
- resolves shop names/areas from `manish-masala-next.local-shops.v1`
- summary cards show today's orders, updated today, adhoc today, and visible value
- filters include salesperson, area, date, date range, time range, and search
- order detail shows item rows, notes, replacement notes, GST, grand total, and visit map link when GPS exists
- admin can edit/delete local orders after confirmation
- manager is read-only for order mutation
- visible filtered orders can be exported to PDF

The admin and manager dashboards now include local Collections review:

- reads local route and adhoc collections from `manish-masala-next.local-collections.v1`
- resolves shop names/areas from `manish-masala-next.local-shops.v1`
- summary cards show today's collections, updated today, adhoc today, and visible amount
- filters include salesperson, area, payment mode, collection type, date, date range, time range, and search
- totals include amount, discount, replacement, cash, cheque, and UPI
- collection detail shows all saved bill rows for the collection
- admin can edit/delete local collections after confirmation
- manager is read-only for collection mutation
- visible collection bill rows can be exported to PDF

The admin and manager dashboards now include local Visit Status:

- reads local visit proofs from `manish-masala-next.local-visit-proofs.v1`
- uses local route orders as productive visit evidence
- classifies route rows as pending, checked in, productive, or unproductive
- filters include date, salesperson, area, status, and search
- visit rows show check-in, order-started, No Order, distance, order value, and map link when GPS exists
- expected route rows are based on locally seeded assigned shops in this temporary local mode

The admin and manager dashboards now include local Targets:

- reads target rows from `manish-masala-next.local-sales-targets.v1`
- uses the same SKU-specific KG calculation as the salesperson target screen
- filters by salesperson and search
- admin can add/edit/delete local target rows after confirmation
- manager is read-only for target mutation
- product/SKU options come from the seeded local product catalog

The admin and manager dashboards now include local Shops:

- reads shop rows from `manish-masala-next.local-shops.v1`
- filters by area, salesperson, GPS status, and search
- shows assignment, GPS anchor status, route reason, override flag, and map link
- admin can add/edit/delete local shops after confirmation
- manager is read-only for shop mutation

Admin and manager tabs are now individual pages instead of one long dashboard page:

- Orders stays on `/admin` and `/manager`
- every other admin/manager tab uses its own route
- navigation uses the same tab order as the original app

The admin and manager dashboards now include local Products:

- reads product/SKU rows from `manish-masala-next.local-product-skus.v1`
- filters by product and search
- shows SKU size, SKU code, rate, MRP, and image URL
- admin can add/edit/delete local SKU rows after confirmation
- manager is read-only for product mutation

The admin and manager dashboards now include local GPS Route:

- reads local visit proofs from `manish-masala-next.local-visit-proofs.v1`
- filters by date, salesperson, and search
- shows visit timeline order, shop, area, visit type, captured time, distance, coordinates, and map link
- full route reconstruction remains a go-live/Supabase-backed follow-up

The admin and manager dashboards now include local Users:

- reads local user/profile rows from `manish-masala-next.local-users.v1`
- falls back to demo users for admin, manager, and sales
- filters by role, active status, and search
- admin can add/edit/activate/deactivate local users after confirmation
- manager is read-only for user mutation
- this screen does not create Supabase Auth users or change live access

The admin dashboard also includes local Data Tools at `/admin/data-tools`:

- exports all local app data as a JSON backup
- imports selected sections from a valid JSON backup
- resets selected localStorage sections
- does not read or write Supabase

The admin dashboard also includes a read-only Go-Live Audit at `/admin/go-live-audit`:

- checks public Supabase env vars
- shows current local/Supabase data mode and write mode
- lists adapter readiness and live-write blockers
- lists required table mappings before production cutover

The rebuild now uses direct Supabase read mappers and protected sync functions:

- `lib/repositories/supabase-read.ts` provides Supabase mappers for shops, products/SKUs, targets, orders, collections, visit proofs, and profiles
- `lib/sync/*` owns writes for core transactional data, including offline replay and protected order/collection deletes
- local browser fallback data remains in `lib/local/*`

The rebuild now includes a production Visit Status route expectation service:

- `services/visit-status.ts` reuses the same route schedule/override/biweekly logic as Sales My Shops
- reads same-day route orders as productive visit evidence
- classifies pending, checked-in, productive, and unproductive rows for a selected salesperson/date
- this service is ready for admin Visit Status go-live wiring after read-adapter QA

In full local app mode, the sales route screen loads the most recent localStorage route snapshot if one exists. To create that snapshot from Supabase data, temporarily run in Supabase mode once, open the sales route page, then return to local mode.

You can also seed route data directly from the local Sales page:

1. Log in locally as `sales`.
2. Use the **Seed Local Route** panel.
3. Enter a real Supabase sales login ID and password.
4. The app reads that salesperson route, all shops, active products/SKUs, and sales targets once, saves them to localStorage, and signs out of Supabase.

This seed action is read-only for business tables.

Only apply and use the latest Supabase migration if you deliberately re-enable Supabase writes:

```text
supabase/migrations/023_allow_override_shop_gps_update.sql
```

This allows same-day override route shops to save GPS anchors during check-in when `NEXT_PUBLIC_SUPABASE_WRITE_MODE=enabled`.

## Validation

```powershell
npm run lint
npm run typecheck
npm run build
npm test
```

`npm test` currently runs lint and typecheck until new Next-specific business tests are added.

## Important Rebuild Notes

- Preserve all existing business behavior from the original app while porting modules.
- Keep the UI compact, mobile-first, dense, and operational.
- Use conventional Tailwind utilities first, for example `p-2` instead of `p-[7px]`.
- Avoid arbitrary Tailwind values unless exact sizing is genuinely required.
- Keep Supabase migrations and Edge Functions aligned with frontend changes.
- Do not deploy this branch as the production replacement until all feature parity work is complete.
