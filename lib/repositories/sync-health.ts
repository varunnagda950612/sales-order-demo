import type { SupabaseClient } from "@supabase/supabase-js";

type SyncHealthProfileRelation =
  | {
      full_name: string | null;
      login_id: string | null;
    }
  | Array<{
      full_name: string | null;
      login_id: string | null;
    }>
  | null;

type SyncHealthRow = {
  id: string;
  sales_person_id: string;
  device_id: string;
  status: "clean" | "pending" | "syncing" | "failed";
  pending_count: number | string;
  syncing_count: number | string;
  failed_count: number | string;
  protected_count: number | string;
  latest_error: string | null;
  user_agent: string | null;
  page_url: string | null;
  last_seen_at: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  updated_at: string;
  profiles?: SyncHealthProfileRelation;
};

type SyncRecoverySnapshotRow = {
  sales_person_id: string;
  device_id: string;
  pending_count: number | string;
  failed_count: number | string;
  snapshot: unknown;
  uploaded_at: string;
};

export type SyncHealthDevice = {
  id: string;
  salesPersonId: string;
  salesPersonName: string;
  loginId: string;
  deviceId: string;
  status: "clean" | "pending" | "syncing" | "failed";
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  protectedCount: number;
  latestError: string | null;
  userAgent: string | null;
  pageUrl: string | null;
  lastSeenAt: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  updatedAt: string;
  recoveryPendingCount: number;
  recoveryFailedCount: number;
  recoverySnapshot: unknown | null;
  recoveryUploadedAt: string | null;
};

export type SyncHealthReadResult = {
  rows: SyncHealthDevice[];
  missingTable: boolean;
  missingRecoveryTable: boolean;
  recoveryError: string | null;
  error: string | null;
};

function toNumber(value: number | string) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getProfile(row: SyncHealthRow) {
  if (!row.profiles) {
    return null;
  }

  return Array.isArray(row.profiles) ? row.profiles[0] || null : row.profiles;
}

function isMissingSyncHealthTableError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    (normalizedMessage.includes("sync_device_health") ||
      normalizedMessage.includes("sync_recovery_snapshots")) &&
    (normalizedMessage.includes("does not exist") ||
      normalizedMessage.includes("schema cache") ||
      normalizedMessage.includes("could not find"))
  );
}

function makeRecoveryKey(salesPersonId: string, deviceId: string) {
  return `${salesPersonId}:${deviceId}`;
}

async function cleanupSyncedRecoverySnapshots(supabase: SupabaseClient) {
  try {
    await supabase.rpc("cleanup_synced_recovery_snapshots");
  } catch {
    // Cleanup is advisory; the sync health page must still load if the RPC is not installed yet.
  }
}

export async function readSyncHealthDevices(
  supabase: SupabaseClient,
): Promise<SyncHealthReadResult> {
  await cleanupSyncedRecoverySnapshots(supabase);

  const { data, error } = await supabase
    .from("sync_device_health")
    .select(
      "id, sales_person_id, device_id, status, pending_count, syncing_count, failed_count, protected_count, latest_error, user_agent, page_url, last_seen_at, last_attempt_at, last_success_at, updated_at, profiles(full_name, login_id)",
    )
    .order("failed_count", { ascending: false })
    .order("pending_count", { ascending: false })
    .order("last_seen_at", { ascending: false });

  if (error) {
    return {
      rows: [],
      missingTable: isMissingSyncHealthTableError(error.message),
      missingRecoveryTable: false,
      recoveryError: null,
      error: error.message,
    };
  }

  const recoveryResponse = await supabase
    .from("sync_recovery_snapshots")
    .select("sales_person_id, device_id, pending_count, failed_count, snapshot, uploaded_at");
  const recoveryByDevice = new Map<string, SyncRecoverySnapshotRow>();
  const recoveryError = recoveryResponse.error?.message || null;
  const missingRecoveryTable = recoveryError
    ? isMissingSyncHealthTableError(recoveryError)
    : false;

  if (!recoveryResponse.error) {
    ((recoveryResponse.data || []) as SyncRecoverySnapshotRow[]).forEach((row) => {
      recoveryByDevice.set(makeRecoveryKey(row.sales_person_id, row.device_id), row);
    });
  }

  return {
    rows: ((data || []) as SyncHealthRow[]).map((row): SyncHealthDevice => {
      const profile = getProfile(row);
      const recovery = recoveryByDevice.get(makeRecoveryKey(row.sales_person_id, row.device_id));

      return {
        id: row.id,
        salesPersonId: row.sales_person_id,
        salesPersonName: profile?.full_name || "Unknown salesperson",
        loginId: profile?.login_id || "",
        deviceId: row.device_id,
        status: row.status,
        pendingCount: toNumber(row.pending_count),
        syncingCount: toNumber(row.syncing_count),
        failedCount: toNumber(row.failed_count),
        protectedCount: toNumber(row.protected_count),
        latestError: row.latest_error,
        userAgent: row.user_agent,
        pageUrl: row.page_url,
        lastSeenAt: row.last_seen_at,
        lastAttemptAt: row.last_attempt_at,
        lastSuccessAt: row.last_success_at,
        updatedAt: row.updated_at,
        recoveryPendingCount: recovery ? toNumber(recovery.pending_count) : 0,
        recoveryFailedCount: recovery ? toNumber(recovery.failed_count) : 0,
        recoverySnapshot: recovery?.snapshot || null,
        recoveryUploadedAt: recovery?.uploaded_at || null,
      };
    }),
    missingTable: false,
    missingRecoveryTable,
    recoveryError: recoveryError && !missingRecoveryTable ? recoveryError : null,
    error: null,
  };
}
