export type GoLiveCheck = {
  label: string;
  status: "pass" | "warn" | "blocked";
  detail: string;
};

export function getGoLiveAuditChecks(): GoLiveCheck[] {
  const dataMode = process.env.NEXT_PUBLIC_APP_DATA_MODE || "supabase";
  const writeMode = process.env.NEXT_PUBLIC_SUPABASE_WRITE_MODE || "disabled";
  const parallelTestMode = process.env.NEXT_PUBLIC_PARALLEL_TEST_MODE === "enabled";
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return [
    {
      label: "Supabase URL",
      status: hasSupabaseUrl ? "pass" : "blocked",
      detail: hasSupabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL is configured." : "NEXT_PUBLIC_SUPABASE_URL is missing.",
    },
    {
      label: "Supabase anon key",
      status: hasSupabaseAnonKey ? "pass" : "blocked",
      detail: hasSupabaseAnonKey
        ? "NEXT_PUBLIC_SUPABASE_ANON_KEY is configured."
        : "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.",
    },
    {
      label: "Data mode",
      status: dataMode === "local" ? "warn" : "pass",
      detail:
        dataMode === "local"
          ? "App is still in local data mode. Supabase reads are available only through explicit read adapters."
          : "App data mode is not local.",
    },
    {
      label: "Supabase write mode",
      status: writeMode === "enabled" ? (parallelTestMode ? "warn" : "pass") : "blocked",
      detail:
        writeMode === "enabled"
          ? parallelTestMode
            ? "Parallel test writes are enabled. The old app remains available; use only the isolated test account."
            : "Writes are enabled for live Supabase saves."
          : "Writes are disabled. Orders, visits, collections, and admin changes will not save to Supabase.",
    },
    {
      label: "Orders/collections/visit proof adapters",
      status: "pass",
      detail:
        "Core data reads come from Supabase and merge pending local recovery records. Run 025, 028, 030, and 031 so the idempotent RPC write aliases, stale-order guards, and compact GPS proofs are installed before enabling writes.",
    },
    {
      label: "Sync health visibility",
      status: "warn",
      detail:
        "Run 026_add_sync_device_health.sql and 027_add_sync_recovery_snapshots.sql before go-live so admin can see pending/failed counts and protected unsynced payload details.",
    },
    {
      label: "Visit Status expected routes",
      status: "warn",
      detail:
        "Production route expectation service exists for a selected salesperson/date, but the admin UI still uses local assigned-shop approximation.",
    },
    {
      label: "Users/Auth writes",
      status: "pass",
      detail:
        "Admin user create/update/reset flows are wired through the admin-users Edge Function. Deploy the function and set its secrets before go-live.",
    },
  ];
}

export const goLiveTableMappings = [
  "orders -> public.orders + public.order_items",
  "collections -> public.collections",
  "visit proofs -> public.visit_proofs",
  "shops -> public.shops",
  "products/SKUs -> public.products + public.product_skus",
  "targets -> public.sales_targets",
  "users -> auth.users + public.profiles",
  "sync health -> public.sync_device_health",
  "sync recovery snapshots -> public.sync_recovery_snapshots",
  "core sync RPC aliases -> public.save_order_with_items_v2 + public.sync_visit_proof_v2 + public.save_collection_group_v2",
  "route expectations -> public.area_route_schedules + public.route_overrides + public.shops + public.visit_proofs",
];
