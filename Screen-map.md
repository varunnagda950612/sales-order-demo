# Screen Map - Manish Masala PWA v1 (`main` branch)

This document maps the **original PWA screens/pages/tabs** from the `main` branch.

It is intended for:

- UI redesign
- rebuild planning
- screen inventory
- understanding what fields/actions each page contains

This is a **screen-level reference**, not a code summary.

---

## 1. Global Shell

## 1.1 Login Screen

### Purpose

Authenticate user into the app.

### Visible fields

- User ID
- Password
- Sign in button

### Display notes

- In non-Supabase/demo mode, demo credentials may be prefilled
- Helper login text changes depending on cloud/local mode

### Actions

- Sign in

### Result

- Admin -> Admin dashboard
- Manager -> Manager dashboard
- Sales -> Sales dashboard

### Validation

- user ID required
- password required
- role/profile must exist and be active

---

## 1.2 Top Bar

### Purpose

Persistent header after login.

### Visible items

- app logo
- app title
- current user name
- current role label
- logout button

### Actions

- Logout

---

## 1.3 Main Tabs

### Admin/Manager tabs

1. Orders
2. Collections
3. Visit Status
4. Targets
5. Shops
6. Products
7. GPS Route
8. Users

### Sales tabs

1. My Shops
2. Adhoc Order
3. My Orders
4. Collections
5. Targets

---

## 1.4 Back to Top Button

### Purpose

Return user to top of current page/scroll containers.

### Behavior

- appears only after meaningful page or internal scroll
- scrolls both window and major internal scroll containers back to top

---

## 2. Salesperson Screens

## 2.1 My Shops

### Purpose

Primary daily route screen for salesperson.

### Header/summary area

Visible items:

- route day label
- selected date
- page title
- helper text
- summary cards:
  - Shops
  - Visited
  - GPS Saved
  - Overrides

Optional elements:

- active route override chips
- local-route seed/import warning blocks depending on mode

### Filters

- Search
- Area dropdown
- GPS dropdown

### Search behavior

Search matches:

- shop name
- area
- phone
- address

### Each shop card shows

- shop name
- override tag if applicable
- area
- address
- phone
- visit status badge
- GPS status card
- route source card

### Visit status values shown on card

- Pending
- Checked in
- Order started
- No order

### Route source values

- Override
- Scheduled

### Shop card actions

- Get Direction
- Visit Shop
- No Order
- Collection

### Action details

#### Get Direction

Opens external map directions using saved shop GPS.

#### Visit Shop

Starts route order flow after GPS validation.

#### No Order

Marks visited without order after GPS validation and confirmation.

#### Collection

Enabled only when same-day route visit has reached:

- Order started / order placed flow
- No Order

### Empty state

If no shops match filters:

- no-shops illustration/icon
- explanatory text

### Modal/overlay launched from this screen

- Create/Edit Order modal

---

## 2.2 Order Modal / Order Entry Screen

This modal is launched from:

- My Shops -> Visit Shop
- Adhoc Order -> Order
- My Orders -> Edit

### Purpose

Create or update an order.

### Header area

Visible items:

- shop area or contextual label
- shop name or action title
- close button

For some cases:

- second line shop name
- adhoc indicator context
- edit-order context

### Main form - entry step

Visible sections:

- product search field
- product catalog grid/list
- Free notes textarea
- Replacement notes textarea
- review/next button

### Product search

Matches:

- product name
- SKU size
- SKU code alias

### Product line/card content

- product name
- SKU size
- SKU code
- rate
- quantity field
- live line total
- KG helper label
- optional product image space in full production design

### Live totals block

Visible values:

- Subtotal
- GST @ 5%
- Grand Total

### Notes area

- Free
- Replacement

### Review step

Visible content:

- selected items table
- qty
- rate
- total
- subtotal
- GST
- grand total
- previous button
- submit button

### Submit behavior

- create order if new
- update order if editing

### Key UX rule

Pressing Enter inside quantity inputs should not accidentally jump to next step or submit.

---

## 2.3 Adhoc Order

### Purpose

Allow urgent out-of-route order taking.

### Header area

Visible items:

- icon
- urgent phone order label
- page title
- helper text

### Filters

- Search shops
- Area dropdown where implemented

### Search behavior

Matches:

- shop name
- area
- phone
- address

### Shop row/card content

- shop name
- area
- phone
- address

### Actions per shop

- Order
- Collection

### Important difference from route shops

- no route geofence flow in the same way as route order
- order is tagged as adhoc

### Modal launched

- Order modal

---

## 2.4 My Orders

### Purpose

Show salesperson’s own orders.

### Header/summary area

Visible items:

- Local/Orders label depending on mode
- page title
- summary cards:
  - Orders count
  - Value

### Filters

Depending on evolved build/version:

- area
- date
- time filters

### Each order row/card/table entry shows

- date/time
- shop name
- item count
- order value
- status tags:
  - Adhoc
  - Updated

### Actions

- View
- Edit
- Delete
- PDF Share / Download where available in full production flow

### View Order modal

Shows:

- item list
- quantity
- rate
- line total
- subtotal
- GST
- grand total
- Free notes
- Replacement notes

### Edit flow

Opens same order modal in edit mode.

### Delete flow

- asks confirmation
- removes order locally
- sync/delete handling depends on cloud mode

### Empty state

- no-orders illustration/icon
- explanatory text

---

## 2.5 Collections

### Purpose

Allow salesperson to create and review collection/payment entries.

### Header/summary area

Visible items:

- page label
- page title
- helper text
- summary cards:
  - Rows
  - Cash total
  - Cheque total
  - UPI total

### Create collection block

Visible fields:

- Eligible shop dropdown
- Add Collection button

### Eligible shop options

Can include:

- route shops with completed visit outcome
- adhoc shops

### Filters

- Search
- Area
- Created date
- Payment Mode

### Collections table/list columns

- Shop
- Bill
- Mode
- Amount
- Discount
- Replacement
- Created
- Actions

### Shop column

Shows:

- shop name
- area

### Bill column

Shows:

- bill number
- bill date
- cheque date if applicable

### Created column

Shows:

- creation timestamp
- bill count label (e.g. 1 bill / 2 bills)

### Actions

- Edit
- Delete

### Footer row

Shows:

- visible amount total
- cash total
- cheque total
- UPI total

### Empty state

- no-collections icon
- explanatory text

### Modal launched

- Add/Edit Collection modal

---

## 2.6 Collection Modal / Add Collection

### Purpose

Create or edit one collection header with one or more bill rows.

### Header

Visible items:

- area
- Add Collection / Add Adhoc Collection / Edit Collection title
- shop name
- close button

### Persistent amount block

Visible items:

- Amount to be collected
- live total of all Amount fields only

### Bill row card content

For each bill row:

- Bill date
- Bill number
- Amount
- Payment mode
- Discount
- Replacement
- Cheque date if payment mode = cheque
- Remove button

### Page-level actions

- Add Bill
- Save Collection / Update Collection

### Validation expectations

- bill date required
- bill number required
- amount required and > 0
- cheque date required if payment mode is cheque

---

## 2.7 Targets

### Purpose

Show salesperson target progress.

### Visible items

Depending on full production state:

- overall target summary
- completed
- pending
- progress ring
- SKU-level target cards/list

### Required concepts on screen

- target KG
- completed KG
- pending KG
- progress percentage
- motivational/progress text

### Important business emphasis

The owner wanted salesperson focus mainly on:

- completed
- pending

while keeping target visible.

---

## 3. Admin / Manager Screens

## 3.1 Orders

### Purpose

Central review of all route and adhoc orders.

### Header/summary area

Visible items:

- summary cards for today:
  - Today’s orders
  - Updated today
  - Adhoc today

### Filters

- Salesperson dropdown
- Area dropdown
- Date
- Date From
- Date To
- Time From
- Time To

### Order list/table columns

Typically includes:

- No.
- Status
- Shop Name
- Area
- Salesperson
- Date/Time
- Order Details
- Actions

### Order status values/tags

- placed
- updated
- adhoc

### Actions

- View
- Edit
- Delete
- Map
- Download PDF
- Share PDF where applicable

### View order modal

Shows:

- product/SKU list
- quantities
- rate
- totals
- GST
- Free
- Replacement

### Edit order modal

Uses same core order form with edit state.

### Delete flow

- confirm first
- if backend permanent rejection occurs, order may be restored

### PDF actions

Uses current filters:

- salesperson
- area
- date/date range

---

## 3.2 Collections

### Purpose

View and manage all collections.

### Filters

- Salesperson
- Area
- Date
- Payment Mode

### Table columns

- No.
- Bill Date
- Bill Number
- Shop Name
- Amount
- Discount
- Replacement
- Mode
- Cheque Date if relevant
- Salesperson
- Actions

### Actions

- Edit
- Delete
- Export PDF

### Footer/totals

- total visible amount
- payment mode totals

---

## 3.3 Visit Status

### Purpose

Monitor route coverage quality by salesperson/date/area.

### Filters

- Salesperson
- Area
- Date
- Date range in later revision

### Summary cards

Expected values:

- Route Shops
- Checked In
- Pending
- Productive Visit
- Unproductive Visit
- Total KG sold for filtered scope

### Pending section

Shows shops that were expected in route but not completed according to visit logic.

Columns/content typically include:

- shop name
- area
- salesperson

### Checked-in section

Shows visited shops.

May include:

- numbering
- shop name
- area
- salesperson
- order/no-order indicator
- map/open location action

### Mobile behavior

This screen had compactness and collapsible/mobile treatment concerns.  
Desktop and mobile were intentionally treated differently at times.

---

## 3.4 Targets

### Purpose

Assign and review SKU-wise targets.

### Main table/list

Visible columns conceptually include:

- Product SKU
- Target KG
- Salesperson
- Start Date
- End Date
- Completed
- Pending
- Status
- Actions

### Filters

- Salesperson

### Create/Add Target entry

Originally evolved toward modal-based creation.

Fields:

- Product SKU
- Target KG
- Salesperson
- Start Date
- End Date

### Actions

- Add new row
- Save targets
- Edit target
- Delete target where applicable

---

## 3.5 Shops

### Purpose

Manage shop master and route-related controls.

### Top controls / filters

- Salesperson dropdown
- Area dropdown
- Search
- Location status dropdown:
  - All
  - Location Saved
  - Location Pending

### Main actions

- Add Shop
- Route Override
- Bulk Import
- Schedule management actions

### Shop list/card/table content

Each shop typically shows:

- shop name
- area
- address
- phone
- assigned salesperson
- GPS saved/pending status

### Shop actions

- Edit
- Reset GPS
- Get Direction
- Delete where permitted

### Add/Edit Shop modal/form

Fields conceptually include:

- Shop name
- Phone
- Address
- Area
- Salesperson

Owner field is intentionally removed from active UI flow.

### Route Override UI

Fields:

- Date
- Salesperson
- Area

Table/list shows active overrides.

### Area Schedule UI

Fields:

- Area
- Salesperson
- Visit day
- Frequency
- Start date

### Bulk Import UI

Supports Excel file input for shops.

---

## 3.6 Products

### Purpose

Manage product and SKU master.

### Top controls

- Search
- Add Product
- Bulk Upload

### Product list/table/card content

Typical data shown:

- product name
- SKU size
- SKU code
- rate
- MRP
- optional product image

### Add/Edit Product modal/form

Fields include:

- Product Name
- Category
- SKU Size
- SKU Code
- Rate
- MRP
- Image URL

### Bulk import

Uses Excel upload with structured columns.

---

## 3.7 GPS Route

### Purpose

See a salesperson’s GPS timeline and route for a date.

### Filters

- Salesperson
- Date

### Main visual areas

- map panel
- visit timeline/list
- external route/open-map links

### Timeline row content

Each visit row can show:

- sequence number
- shop name
- date/time
- area
- map link

### Map features

- markers
- route/path
- selected marker emphasis
- popup info

---

## 3.8 Users

### Purpose

Manage app users and team settings.

### User list/table

Typical fields:

- name
- login ID
- role
- geofence meters
- active/inactive
- assigned shop count / order count context where shown

### Main actions

- Add user
- Edit user
- Reset password
- Delete/deactivate where permitted

### Add/Edit User form

Fields conceptually include:

- full name
- login ID
- role
- password / reset flow
- geofence meters
- active state

### Supported roles

- admin
- manager
- sales

---

## 4. Shared Modals and Overlays

The original app heavily used modal overlays for actions instead of route changes.

Main modals:

- Order modal
- View order modal
- Collection modal
- Add/Edit shop modal
- Add/Edit product modal
- Add/Edit salesperson modal
- Password reset modal
- Target edit/create modal

### Common modal behavior

- close button
- close action should not accidentally lose data without confirmation where destructive
- closing modal can trigger deferred realtime refresh logic

---

## 5. Key Screen-to-Action Relationships

## Sales

- My Shops -> Visit Shop -> Order modal
- My Shops -> No Order -> visit proof saved
- My Shops -> Collection -> Collections tab/modal
- Adhoc Order -> Order modal
- Adhoc Order -> Collection
- My Orders -> View / Edit / Delete / PDF
- Collections -> Add / Edit / Delete / totals

## Admin/Manager

- Orders -> View / Edit / Delete / Map / PDF
- Collections -> Edit / Delete / PDF
- Visit Status -> inspect route completion and map evidence
- Targets -> create/edit target rows
- Shops -> add/edit/import/reset GPS/override/schedules
- Products -> add/edit/import/search
- GPS Route -> map timeline and route
- Users -> manage roles, geofence, password reset

---

## 6. Important Screen Design Constraints for Rebuild

These are not strict code rules, but they are screen-behavior constraints the owner repeatedly reinforced:

1. Mobile-first density matters more than decorative spacing
2. Filters must remain easy to reach
3. Internal scroll on mobile should be minimized where possible
4. Large datasets need table/list compaction
5. Order entry must remain fast for field staff
6. Collection entry must support multiple bill rows without confusion
7. PDF-trigger buttons must use current filter state
8. Visit-status data must not be simplified into order-only reporting

---

## 7. Related Reference Documents

- [Logic.md](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/Logic.md)
- [AI_CONTEXT.md](C:/Users/varun/OneDrive/Documents/MM-sales-order-app/AI_CONTEXT.md)

