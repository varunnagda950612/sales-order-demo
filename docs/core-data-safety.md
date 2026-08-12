# Core Data Safety and Cutover

## Current state

The checked-in environment remains read-only:

```env
NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled
NEXT_PUBLIC_MUTATION_PREVIEW_MODE=enabled
```

Do not change these values or apply migration `025_core_data_idempotent_sync.sql` while the old live app is still responsible for writes.

## Parallel Test Mode

When the old app must remain live while this Next.js app is tested with a separate salesperson, do **not** apply migration `025_core_data_idempotent_sync.sql`. That migration intentionally removes the old app's direct write permissions.

Instead, apply [enable-parallel-core-sync.sql](/C:/Users/varun/OneDrive/Documents/MM-sales-order-app/supabase/manual/enable-parallel-core-sync.sql) once through the linked Supabase project. It only adds schema required by the protected sync flow and creates versioned `*_v2` RPCs. It does not replace the old `save_order_with_items` RPC or revoke table permissions used by the old app.

For a controlled local test, this repository's `.env.local` is configured as:

```env
NEXT_PUBLIC_SUPABASE_WRITE_MODE=enabled
NEXT_PUBLIC_MUTATION_PREVIEW_MODE=disabled
NEXT_PUBLIC_PARALLEL_TEST_MODE=enabled
```

Use an isolated salesperson, shops, and route area. Records created by that account are still real Supabase rows. The queue, retry handling, and idempotent versioned RPCs remain active; only the legacy app's ability to write is preserved during this phase.

## Protections in the new app

- Order, order-item, visit-proof, and collection payloads enter a local recovery queue before the normal local screen state changes.
- The recovery queue is stored synchronously in local storage and mirrored to IndexedDB.
- Network failure leaves the record queued and retries automatically when the browser is online.
- The sync functions are idempotent, so a retry cannot duplicate an order, visit proof, or collection group.
- Order header, order items, and a new route order proof are written in one database transaction.
- The server stores an immutable `core_data_events` snapshot for every protected mutation.
- An explicit admin order deletion is a hard delete: the order, its item rows, and its order-event snapshots are removed. The existing GPS visit is retained with no order link, matching the original app flow.
- Hard deletion stores only the deleted order UUID in `deleted_order_ids`; no order content is retained. This tombstone prevents a delayed offline save from recreating the deleted order.
- Collection deletion is also a hard delete: collection bill rows and collection-event snapshots are removed.
- Collection hard deletion stores only the deleted collection group UUID in `deleted_collection_ids`; no collection content is retained. This tombstone prevents a delayed offline save from recreating the deleted collection.
- At cutover, direct browser insert, update, and delete access to the four core tables is removed. Only the validated transactional RPC functions can change them.
- The collection-to-shop foreign key changes from cascade deletion to restrict deletion, so deleting a shop cannot erase collection history.

## Offline, timeout, and logout behaviour

- If the sales screen is already open and connectivity drops, a new core record is saved to the protected browser queue first. It remains visible locally and sync resumes after the network returns.
- Each Supabase RPC has a 25-second client timeout. A timeout is treated as an unknown server outcome, not a failed save: the record remains queued and retries with exponential backoff up to once per minute.
- The RPCs are idempotent. If Supabase completed a request after the browser timed out, the retry updates the same order, visit proof, or collection group instead of creating a duplicate.
- Temporary failures such as offline state, fetch failures, 429 responses, 5xx responses, gateway errors, and expired authentication stay pending and retry automatically.
- Schema, validation, and permission failures are marked as failed rather than discarded. The sync banner exposes the error, offers retry, and can download an owner-scoped recovery copy.
- Sign-out never clears queued core data. The app warns before sign-out when that account has pending records, and a later login by the same account resumes its queue automatically.
- A different account on the same browser cannot upload another user's queued records. Sync is scoped to the account that created the mutation.
- Closing the browser or restarting the device does not erase the queue; recovery occurs on the next app open and sign-in for the same account.

The app must already have been opened and authenticated before working without network. A brand-new login or first page load while entirely offline still needs connectivity; a separate offline-first PWA shell would be needed to support that workflow safely.

## Operational limit

No browser application can recover a record after its browser profile or device has been deliberately erased before the record reaches Supabase. When the sync banner reports pending or failed records, do not clear browser data. Download the recovery copy first and resolve the sync issue.

## Go-live sequence

1. Stop using the old app for new orders, visits, and collections during the cutover window.
2. Create a Supabase database backup or restore point.
3. Apply the unrun migrations in order: `023_allow_override_shop_gps_update.sql`, `024_prevent_duplicate_shop_names.sql`, then `025_core_data_idempotent_sync.sql`.
4. Deploy the new app once with writes still disabled and confirm live reads, login, route data, orders, collections, and reports.
5. Confirm the old app is no longer used for core writes. Migration 025 intentionally blocks its direct core-table write paths.
6. Set `NEXT_PUBLIC_SUPABASE_WRITE_MODE=enabled` and `NEXT_PUBLIC_MUTATION_PREVIEW_MODE=disabled`, then redeploy.
7. Perform one controlled route order, one no-order visit, and one collection. Confirm each appears in the new app and in Supabase before normal use begins.

## Recovery procedure

1. Keep the browser open on the affected device.
2. Use **Download recovery copy** in the core-data sync banner.
3. Fix connectivity or authentication, then use **Retry sync**.
4. Do not clear site data until the banner has cleared and the records are visible in Supabase.
