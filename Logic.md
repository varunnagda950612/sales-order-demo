# Manish Masala PWA v1 Logic Reference

This document captures the **functional logic of the original PWA on the `main` branch**.

It is intended for:

- redesigning the UI without losing behavior
- rebuilding on another tech stack
- onboarding a new developer who needs to understand **what the app does**, not only how the code is written

This document is **not** a code summary.  
It is a **behavior and workflow reference** for the original production-style PWA.

---

## 1. Scope of This Document

This document describes logic from the **`main` branch** legacy app:

- vanilla JS SPA
- `app.js` driven
- tab-based UI
- localStorage working copy
- optional Supabase production mode

It includes:

- page-level behavior
- role behavior
- data flow
- validation rules
- sync rules
- reporting behavior
- edge cases
- business assumptions

It also notes places where behavior is:

- sensitive
- easy to break
- partially deferred
- operationally important

---

## 2. High-Level Application Purpose

The app is an internal sales operations PWA for **Manish Masala**.

The business goal is to manage:

- salesperson login
- daily route shops
- GPS-based shop visit verification
- route order collection
- adhoc/urgent orders outside the route
- collection/payment tracking
- admin review of all field activity
- sales targets
- visit status and GPS route reporting

This is **not** a public e-commerce app.  
It is an internal operational tool used by:

- Admin
- Manager
- Salesperson

---

## 3. Core Roles and Permission Logic

### 3.1 Admin

Admin can:

- see all shops
- see all orders
- see all collections
- see all visit status
- see GPS route data
- manage products
- manage users
- manage targets
- manage route overrides
- manage area schedules
- reset shop GPS
- delete or edit orders
- edit or delete collections
- create users and reset passwords
- export PDFs

Admin is the full-control operational role.

### 3.2 Manager

Manager is intended to behave like a **read-heavy admin**.

Manager can see almost everything admin sees, but should not have destructive/master-edit privileges in the same way admin does.

Manager logic is important because it is easy to accidentally over-permit or under-permit when refactoring.

### 3.3 Salesperson

Salesperson can:

- see only their relevant route shops
- take route orders
- take adhoc orders
- mark `No Order`
- add collections
- see and edit their own eligible orders
- see their own target progress
- use direction links

Salesperson cannot:

- manage all masters
- see all users
- see all routes
- see all shops globally

Sales logic is heavily optimized for mobile operational usage.

---

## 4. Global App Behavior

## 4.1 Navigation Model

The app does **not** use URL routing for the main business app.  
It uses a **tab/state-based SPA model**.

### Admin/Manager tab order

The tab order is business-specific and should not be changed casually:

1. Orders
2. Collections
3. Visit Status
4. Targets
5. Shops
6. Products
7. GPS Route
8. Users

### Sales tab order

1. My Shops
2. Adhoc Order
3. My Orders
4. Collections
5. Targets

### Default tab behavior

- admin/manager default start tab = `orders`
- sales default start tab = `shops`

### Refresh behavior

Two refresh behaviors were intentionally separated:

#### Normal refresh

Should preserve:

- active tab
- many filters
- scroll context where possible

#### Deploy/update refresh

Should send users back to clean startup behavior so the new code is used properly.

This distinction is important and was requested by the owner.

---

## 4.2 Local State and Cloud State

The v1 app uses a **local working state** even in production/cloud mode.

That means:

- the app keeps a local copy of data in browser storage
- the UI operates on local state
- Supabase acts as the shared backend source of truth
- cloud sync updates local state after successful fetch/sync

This was not a pure online-only app.

### Why this matters

This design was used to support:

- faster UI interaction
- fallback behavior
- queued sync patterns
- offline tolerance in some workflows

But it also created sensitivity around:

- stale local data
- sync queues
- reconnect behavior
- duplicate submission risk

---

## 4.3 Persistent Storage

The app stores its working app state in browser `localStorage`.

This includes:

- shops
- orders
- visit proofs
- collections
- targets
- route overrides
- schedules
- pending sync queues
- current UI state

If browser quota is exceeded, the app shows a storage-related error.

This happened historically when too much data was stored locally.

---

## 4.4 Cloud Mode vs Local Mode

The app supports two operating patterns:

### Local/demo mode

- no real Supabase dependency
- demo credentials available
- data remains local

### Cloud mode

- Supabase auth enabled
- shared database used
- realtime refresh enabled
- sync queues used for retryable failures

This distinction affects:

- login flow
- write behavior
- order sync
- visit proof sync
- logout flow
- background refresh

---

## 4.5 Realtime, Refresh, and Scroll Preservation

The app has background refresh logic for cloud mode.

The owner had repeated issues with:

- tab resetting to first tab
- scroll jumping to top
- filters collapsing
- screen flicker
- app becoming hard to use while live data refreshed

Because of that, the app intentionally tries to preserve:

- active tab
- scroll position
- internal scroll containers

Future refactors must treat this as a business requirement, not a cosmetic nicety.

---

## 4.6 Idle Logout and Session Safety

There is idle/logout/session management logic in the app.

This area evolved because the owner initially wanted auto-logout when connection broke, but later found aggressive logout too disruptive.

The real business requirement is:

- do not let users continue silently with stale/broken backend state
- do not lose work
- do not force too many unexpected logouts

So the intended behavior became more nuanced:

- retry where possible
- preserve local work where safe
- show explicit errors when backend rejects writes
- avoid silent data loss

---

## 4.7 PWA Update Logic

The app is installed on phones as a PWA.

PWA updates were a real operational problem due to stale cached code.

So update handling is important for:

- forcing fresh app code after deployment
- resetting startup state appropriately
- preventing users from staying on broken old builds

This logic is different from a normal page reload and should be preserved conceptually in any rebuild.

---

## 5. Authentication Logic

## 5.1 Login Input

User enters:

- login ID
- password

### In local/demo mode

Demo credentials can be used.

### In cloud mode

The login ID is converted into a synthetic email:

`<login_id>@manishmasala.local`

Example:

- `vipul.gala` -> `vipul.gala@manishmasala.local`

The login ID is normalized to lowercase before auth.

## 5.2 Profile Validation After Auth

Successful Supabase auth is not enough.  
The app then loads the matching `profiles` row and checks:

- role exists and is valid
- user is active

If the user is inactive or invalid:

- session is signed out
- login is rejected

## 5.3 Post-login Routing

After successful login:

- admin -> admin dashboard
- manager -> manager dashboard
- sales -> sales dashboard

## 5.4 Logout

Logout does:

- stop realtime sync
- clear local current-user session
- sign out from Supabase in cloud mode
- return user to login screen

---

## 6. Salesperson Pages Logic

## 6.1 My Shops Page

This is the main daily route page for salespeople.

### Purpose

Show only the shops relevant to the salesperson for the selected operational day.

### How shops become visible

A shop can appear in the salesperson route list because of:

1. temporary route override for that date
2. area schedule due for the selected weekday/date
3. fallback legacy `visit_day` + direct assignment behavior

### Shop list filters

The salesperson can filter/search by:

- area
- GPS status
- shop search text

### Shop summary

The page shows top metrics such as:

- total route shops
- visited count
- GPS saved count
- override count

### Each shop card shows

- shop name
- area
- address
- phone
- GPS status
- route source/override status
- action buttons

### Shop-level actions

Each route shop can expose:

- Get Direction
- Visit Shop
- No Order
- Collection

#### Get Direction

Uses saved shop GPS if available.  
If no GPS anchor exists yet, direction link cannot work properly.

#### Visit Shop

This is the route order starting path.

Flow:

1. capture current device location
2. if shop has no saved anchor:
   - ask confirmation
   - save current GPS as shop anchor
3. if shop already has saved anchor:
   - calculate distance from current position
   - compare against allowed geofence
4. if outside allowed range:
   - block order flow
5. if inside allowed range:
   - save visit proof with `order_started`
   - open order modal

#### No Order

Flow:

1. perform the same location validation as route order
2. confirm no-order action
3. save visit proof with `no_order`
4. mark this shop as visited with unproductive outcome

#### Collection button

Collection should **not** unlock merely because a shop has saved GPS.

For route shops, collection becomes enabled only when the shop has been operationally completed for the day:

- order placed, or
- no-order confirmed

This was a strict business requirement.

### Additional route behavior

If route override areas are active for the day, they are shown separately as temporary route indicators.

### Geofence rules on this page

Route order / no-order flows require:

- location permission enabled
- actual GPS reading
- geofence pass if anchor exists

Default route geofence was 100m in common use, but the actual logic also supports per-user geofence settings.

---

## 6.2 Adhoc Order Page

### Purpose

Allow salesperson to take urgent orders outside the planned route.

This exists because the owner receives phone orders from shops outside the daily schedule.

### Adhoc shop source

Adhoc uses shops assigned to the salesperson and visible in the available dataset.

### Filters

- area
- search text

### Key business difference from route orders

Adhoc orders are not treated like normal route visits.

Important distinctions:

- they are clearly tagged as adhoc
- they are operationally valid outside route schedule
- they should not be counted like route GPS visit flow
- they should not be blocked by route geofence logic in the same way

### Adhoc order action

When salesperson selects an adhoc shop:

1. device GPS is captured
2. order modal opens
3. order type is set to `adhoc`

### Adhoc collection access

Adhoc shops can also be used for collections.

---

## 6.3 Order Entry Logic

This logic is shared conceptually between route orders and adhoc orders, but entry conditions differ.

### Entry style

The owner intentionally moved away from old "add item row" behavior.

The expected UX is:

- show product catalog directly
- allow quantity entry on each product
- no "Add item" button per product

### Product search behavior

Search must work using:

- product name
- SKU size
- SKU code / shorthand aliases

Example:

- typing `HP` should show Haldi products

### Product line behavior

Each product line contains:

- product name
- SKU size
- SKU code reference
- rate
- quantity input
- live line total
- helper KG conversion from pieces

### Quantity logic

Quantity is always in **pieces**.

KG is only derived for display or analytics using SKU gram size.

Example:

- 50gm × 5 pcs = 250gm = 0.25kg

### Notes logic

Order form supports:

- Free notes
- Replacement notes

These are plain text notes, not structured order items.

### Live totals

The app continuously calculates:

- subtotal
- GST @ 5%
- grand total

### Enter key behavior

Pressing `Enter` inside quantity inputs must **not** accidentally trigger:

- step change
- review
- submission

This was explicitly requested because salespeople work quickly on mobile.

---

## 6.4 Order Review Step

The owner did not want order confirmation mixed into the same entry screen.

### Intended review flow

1. salesperson enters quantities
2. clicks `Next` / `Review`
3. separate review state opens
4. user can go back to edit
5. final submission happens only from review state

### What review shows

- selected items only
- quantity
- SKU/product context
- totals
- free notes
- replacement notes

This is a deliberate two-step order flow.

---

## 6.5 Order Submission Logic

### Validation before submit

Order cannot be placed if:

- no valid items with quantity > 0 exist
- review has not been completed
- GPS requirements are missing for route order
- Supabase rejects required GPS proof in cloud mode

### Order payload contains

- shop
- salesperson
- order type (`route` or `adhoc`)
- items
- subtotal
- GST
- grand total
- free notes
- replacement notes
- visit location (if available)
- timestamps

### Route order submit behavior

For route orders, the app must ensure visit proof exists for the same operational context.

If visit proof does not yet exist:

- app attempts to create it
- if backend rejects the GPS proof with a non-retryable error, order is blocked

This is critical because the owner does not want orders without valid visit trace.

### Adhoc order submit behavior

Adhoc orders are treated more permissively for visit proof requirements.

### Sync behavior after submit

#### In local mode

- order is stored locally
- success message shown

#### In cloud mode

- order is added locally first
- sync is queued or attempted
- if retryable network issue occurs:
  - order remains locally stored
  - sync retries later
- if hard backend/policy rejection occurs:
  - order should not be treated as successfully placed in backend

### Critical owner requirement

Orders must never be silently lost.

If backend rejection is a real permanent failure:

- app must say so clearly
- app must not pretend everything is safe

---

## 6.6 My Orders Page

### Purpose

Show the salesperson their own placed/updated orders.

### Filters

Sales order views eventually supported:

- area
- date
- time ranges

### Each order row shows

- shop name
- area
- salesperson
- date/time
- order items
- status tags

Possible tags include:

- placed
- updated
- adhoc

### Salesperson actions

- view
- edit
- delete (depending on role and logic at that time)
- share/download PDF

### View order logic

The order detail view should show:

- items
- rate
- quantity
- line totals
- subtotal
- GST 5%
- grand total
- free notes
- replacement notes

### Edit order logic

Salesperson is allowed to edit only under the permitted rule set.

Historically, the app enforced an important restriction:

- salesperson can edit only today's orders
- older orders should be blocked for salesperson and handled by admin if needed

This rule became important because the owner wanted better control after the working day ends.

### Delete behavior

Delete asks for confirmation before action.

In cloud mode:

- delete is applied locally
- backend delete is attempted
- if backend rejects with retryable issue, local retry queue may be used
- if backend rejects permanently, the deleted order may be restored locally

This restore behavior is important and intentional.

---

## 6.7 Collections Page

### Purpose

Allow salesperson to record payment collections for route or adhoc shops.

### Collection unlock rule

This is one of the most important business rules:

#### Route collection

Allowed only after the same-day operational visit is completed via:

- order placed, or
- no order confirmed

#### Adhoc collection

Can be entered through adhoc flow as allowed by business.

### Collection form structure

Each collection can contain **multiple bill rows**.

Each bill row contains:

- Bill date
- Bill number
- Amount
- Discount
- Replacement
- Payment mode
- Cheque date if payment mode is cheque

### Payment modes

- Cash
- Cheque
- UPI

### Validation rules

Each bill row requires:

- bill date
- bill number
- amount > 0
- cheque date if payment mode is cheque

### Modal helpers

- add bill row
- remove bill row
- live “Amount to be collected” total

### Important amount rule

“Amount to be collected” is only the sum of `Amount` fields.  
It does not subtract discount or replacement.

### Collections list page

The collections page shows collection entries in table/list form.

Supported filters include:

- salesperson
- area
- date
- payment mode

### Per-row table information

Each bill row is shown separately even if multiple rows belong to the same shop/collection.

### Edit/delete behavior

Both salesperson and admin workflows were extended to support collection edit/delete.

Confirmation is expected before destructive changes.

---

## 6.8 Targets Page

### Purpose

Show salesperson their SKU-wise target progress in KG.

### Target definition basis

Targets are not just product-level.  
They are SKU-specific.

Example:

- HP50 target 100kg
- HP100 target 50kg

These are tracked separately.

### Completed logic

Completed quantity is computed using:

`pieces ordered × sku gram weight -> kg`

### Salesperson view requirements

Salesperson should see:

- target quantity
- completed quantity
- pending quantity
- overall summary
- progress percentage
- encouraging progress messaging

### UI emphasis

The owner wanted the salesperson to focus mainly on:

- completed
- pending

while still keeping target visible.

The circular gradient progress design came from that requirement.

### Overall target summary rule

Overall summary should not unfairly over-credit excess completion from one SKU against another unfinished SKU.

Meaning:

- individual SKU can exceed target
- but aggregate target logic should respect total set target correctly

---

## 7. Admin and Manager Pages Logic

## 7.1 Orders Page

### Purpose

Central operational order review for admin/manager.

### Visibility

Admin/manager can see:

- all route orders
- all adhoc orders
- updated orders

### Filters

Admin order filters support:

- salesperson
- area
- date
- date range
- from time
- to time

### Summary cards

Order summary is intentionally based on **today’s order data**, not all-time totals.

The summary cards are intended to show:

- today’s orders
- updated today
- adhoc today

This was a deliberate business change.

### Admin row actions

Depending on permissions, admin can:

- view
- edit
- delete
- open map for GPS point
- export PDF

### Edit logic

Admin can edit orders more broadly than sales.

### Delete logic

Delete is confirmed before action.  
Backend rejection handling must avoid silent data corruption.

### GPS/map logic

Admin can open a map link for order GPS/check-in context.

---

## 7.2 Collections Page

### Purpose

Central review of all payment collections.

### Visibility

Admin/manager can see collections across salespeople.

### Filters

- salesperson
- area
- date
- payment mode

### Data display

Collection rows display bill-level entries, not only collection headers.

### Admin actions

- view/edit
- delete
- export collection PDF

### Footer amount totals

Filtered totals are shown by mode:

- cash
- cheque
- UPI

as well as visible amount total.

---

## 7.3 Visit Status Page

### Purpose

Show route coverage quality, not just orders.

This page is very important because the owner explicitly did **not** want visit status to depend only on orders.

### Truth source

Visit Status must be based on:

- visit proofs
- route schedule logic
- route overrides
- area schedule frequency

not just order records.

### Filters

Historically evolved to include:

- salesperson
- area
- single date
- later date range

### Core metrics

The page is expected to show:

- route shops
- checked in
- pending
- productive visits
- unproductive visits
- total KG sold for the filtered period

### Definitions

#### Checked in

Visited based on visit proof / GPS evidence.

#### Pending

Expected route shops not yet operationally completed according to visit logic.

#### Productive visit

Visited + order placed.

#### Unproductive visit

Visited + `No Order`.

### Checked-in vs pending tables

Admin wanted separate visibility into:

- shops visited
- shops pending

Later refinements included:

- more compact UI
- order/no-order indication in checked-in rows
- better mobile layout

### Important caution

Saved shop GPS anchor alone should not make a shop count as checked-in for the day.

---

## 7.4 Targets Page

### Purpose

Allow admin to assign and monitor SKU-wise KG targets for salespeople.

### Target creation inputs

Admin can create multiple target rows with:

- product/SKU
- target kg
- salesperson
- start date
- end date

### Lifecycle behavior

Targets are date-bounded.

Targets should count only within:

- start date
- end date

### Admin table view

Admin later preferred:

- full-width table
- salesperson filter
- modal-based target creation

instead of oversized card-heavy UI.

### Editing

Admin needs ability to edit target rows when corrections are required.

---

## 7.5 Shops Page

### Purpose

Manage shop master and route structure.

### Visibility

Admin/manager sees all shops.

Salesperson sees only route-relevant or assigned shops depending on role and filters.

### Shop filters

The page supports combinations of:

- salesperson
- area
- search
- GPS saved/pending

### Shop actions

Depending on role:

- add shop
- edit shop
- import via Excel
- reset GPS
- route override management
- area schedule management
- direction link

### Add/edit shop logic

Key business rules:

- both admin and sales can add shops
- duplicate names blocked case-insensitively
- area should be dropdown based on known areas
- visit day should not be a normal visible input

### GPS reset logic

Admin needs GPS reset because the first saved location may be wrong.

### Bulk import logic

Shop import expects structured Excel input.  
Shop creation from file is a primary workflow for large shop sets.

### Route override logic

Admin can temporarily assign an area to another salesperson for a given date.

Important:

- override is temporary
- override affects shop visibility
- override affects visit status expected routes

### Area schedule logic

Areas can be:

- weekly
- biweekly

This is used to decide whether an area is due on a date.

---

## 7.6 Products Page

### Purpose

Manage product master and SKU catalog used in order entry and targets.

### Product structure

Products are effectively product + SKU based.

Important fields:

- product name
- category
- SKU size
- SKU code
- rate
- MRP
- optional image URL

### Search behavior

Admin wanted product search by:

- product name
- SKU code

### Bulk import

Product import from Excel is a primary master-data path.

### UI requirements

Owner wanted:

- add product button near top
- search near top
- internal scroll for long product lists

### Product image logic

Image URL is optional.

When present:

- should be HTTPS
- often points to public Supabase Storage object

---

## 7.7 GPS Route Page

### Purpose

Allow admin to inspect the salesperson’s GPS route/timeline for a day.

### Filters

- salesperson
- date

### Base data source

Route timeline is built from visit proofs.

### Map behavior

The page can show:

- map pins
- route timeline list
- external maps links
- reconstructed path

### Important analytics rule

Adhoc orders should not distort the normal route timeline in the same way route visits do.

### Google Routes integration

Walking route reconstruction was later introduced via Google Routes API through an Edge Function.

This is more advanced than simple pin display.

---

## 7.8 Users Page

### Purpose

Manage team members and role setup.

### Admin capabilities

Admin can:

- create user
- set role
- set name
- set login credentials through supported flow
- reset password
- set geofence
- edit user
- deactivate user in supported data model

### Roles available

- admin
- manager
- sales

### Manager logic

Manager is meant to have visibility like admin but without destructive permissions.

### Password flow

The owner requested very direct password visibility flows at times, but the safe implementation direction is:

- create/reset password
- not retrieve current password in plain text

That is an important business-vs-security compromise to remember.

---

## 8. Shared Operational Rules

## 8.1 Geofencing

### First visit

If shop has no GPS anchor:

- salesperson can save current location as the anchor

### Later route visits

If anchor exists:

- current location is compared to anchor
- if outside allowed range, route order flow is blocked

### Adhoc

Adhoc does not follow route geofence in the same way.

## 8.2 Location Permission

If device location is off or permission is blocked:

- salesperson should not be able to proceed with route check-in/order logic

Poor GPS accuracy is a separate issue from permission being disabled.

## 8.3 Duplicate Visit Proof Prevention

The app has duplicate protection windows for visit proofs.  
This exists because repeated taps/network timing created duplicate entries historically.

## 8.4 Case-insensitive Duplicate Shop Blocking

Shop names are treated case-insensitively for duplicate prevention.

## 8.5 Confirmation Prompts

The owner explicitly wanted confirmation prompts before:

- save
- import
- delete
- other destructive changes

This was added to reduce accidental operational mistakes.

## 8.6 Collection Unlock Rule

Route collection must unlock only after same-day route activity is operationally completed, not merely because GPS exists.

## 8.7 PDF Export Naming

When admin filters by salesperson:

- exported file name
- PDF subtitle

should use that salesperson’s name.

If no salesperson is selected:

- use `admin`

## 8.8 Orders vs Visit Proofs

Do not assume:

- every check-in has an order
- every order guarantees a valid route visit proof
- saved shop GPS anchor means a real daily visit happened

These were separate business concepts throughout the system.

---

## 9. Reporting and PDF Logic

## 9.1 Orders PDF

### Ordering rules

- route orders first
- adhoc orders at end

### Status tagging

- adhoc clearly tagged
- updated clearly tagged

### Layout expectations

- compact
- print-friendly
- dark enough lines/text
- continuation logic for split orders

### Continuation rule

The owner preferred continuation marking only when an order spills across a new page, not just into another column on the same page.

## 9.2 Collections PDF

### Grouping rule

Collections are grouped by shop, not by payment mode section.

### Multiple rows for same shop

- same shop can show multiple bill rows
- one serial number can cover multiple lines
- amount-only subtotal can appear for that shop

### Footer totals

At the end, totals should still be summarized separately by:

- cash
- cheque
- UPI

### Mode abbreviations

Expected shorthand:

- csh
- chq
- UPI

---

## 10. Current Known Logic Gaps / Deferred Rules in v1

These were discussed or partially implemented, but should be treated carefully in a rebuild:

1. strict hard stop on salesperson editing yesterday’s order after midnight
2. fully robust offline sync for orders and collections
3. ideal session recovery after long idle reconnects
4. start route / end route explicit workflow
5. WhatsApp urgent-order integration
6. stronger duplicate-visit-proof prevention in all edge cases

---

## 11. Rebuild Guidance

If this app is rebuilt on another stack, preserve these things first:

1. role permissions
2. route-vs-adhoc separation
3. visit proof logic
4. route geofence logic
5. collection unlock logic
6. PDF reporting rules
7. area schedule + route override logic
8. salesperson mobile speed and compactness
9. explicit backend failure visibility for orders

If a redesign changes visual structure, that is acceptable.  
If a redesign changes any of the above behaviors without business approval, it is a regression.

---

## 12. Source Reference for This Logic

This document is based on the original `main` branch logic from:

- `app.js`
- `src/state.js`
- `src/selectors.js`
- `src/views/*`
- `src/features/*`
- `src/services/*`
- `src/repositories/*`
- `AI_CONTEXT.md`

This document should be treated as the behavioral reference for **v1 of the PWA app**.
