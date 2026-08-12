import { isLocalAppMode } from "@/lib/config/app-mode";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getCoreMutationActorId,
  readCoreOutbox,
  type CoreMutation,
  type CoreSyncSummary,
} from "@/lib/sync/core-outbox";

const syncHealthDeviceIdStorageKey = "manish-masala-next.sync-device-id.v1";
const minHeartbeatIntervalMs = 30_000;
const maxTextLength = 500;

let lastHeartbeatAt = 0;
let lastHeartbeatSignature = "";
let lastSnapshotSignature = "";

type ReportSyncHealthOptions = {
  actorId: string;
  summary: CoreSyncSummary;
  writesEnabled: boolean;
  localMode: boolean;
};

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function makeDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function truncateText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.slice(0, maxTextLength);
}

export function getSyncHealthDeviceId() {
  if (!canUseBrowserStorage()) {
    return makeDeviceId();
  }

  const existingDeviceId = window.localStorage.getItem(syncHealthDeviceIdStorageKey);

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = makeDeviceId();
  window.localStorage.setItem(syncHealthDeviceIdStorageKey, deviceId);
  return deviceId;
}

function getUnsyncedMutations(actorId: string) {
  return readCoreOutbox().filter(
    (mutation) =>
      getCoreMutationActorId(mutation) === actorId &&
      mutation.status !== "synced",
  );
}

function toMutationMetadata(mutation: CoreMutation) {
  return {
    id: mutation.id,
    kind: mutation.kind,
    entityKey: mutation.entityKey,
    status: mutation.status,
    attempts: mutation.attempts,
    createdAt: mutation.createdAt,
    updatedAt: mutation.updatedAt,
    nextAttemptAt: mutation.nextAttemptAt,
    lastError: mutation.lastError,
  };
}

function buildRecoverySnapshot(actorId: string, mutations: CoreMutation[]) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    actorId,
    pageUrl: window.location.href,
    pending: {
      mutations: mutations.map(toMutationMetadata),
      orders: mutations.flatMap((mutation) =>
        mutation.kind === "order" ? [mutation.payload.order] : [],
      ),
      collections: mutations.flatMap((mutation) =>
        mutation.kind === "collection" ? [mutation.payload.collection] : [],
      ),
      visitProofs: mutations.flatMap((mutation) => {
        if (mutation.kind === "visit") {
          return [mutation.payload.visit];
        }

        if (mutation.kind === "order" && mutation.payload.orderStartedVisit) {
          return [mutation.payload.orderStartedVisit];
        }

        return [];
      }),
    },
  };
}

function getSyncStatus(summary: CoreSyncSummary) {
  if (summary.failed > 0) {
    return "failed";
  }

  if (summary.syncing > 0) {
    return "syncing";
  }

  if (summary.pending > 0) {
    return "pending";
  }

  return "clean";
}

export async function reportSyncHealth({
  actorId,
  summary,
  writesEnabled,
  localMode,
}: ReportSyncHealthOptions) {
  if (
    !actorId ||
    localMode ||
    isLocalAppMode() ||
    !writesEnabled ||
    typeof navigator === "undefined" ||
    !navigator.onLine
  ) {
    return;
  }

  const status = getSyncStatus(summary);
  const protectedCount = summary.pending + summary.syncing + summary.failed;
  const signature = [
    actorId,
    status,
    summary.pending,
    summary.syncing,
    summary.failed,
    summary.latestError || "",
  ].join(":");
  const now = Date.now();

  if (signature === lastHeartbeatSignature && now - lastHeartbeatAt < minHeartbeatIntervalMs) {
    return;
  }

  lastHeartbeatSignature = signature;
  lastHeartbeatAt = now;

  const timestamp = new Date().toISOString();
  const deviceId = getSyncHealthDeviceId();
  const unsyncedMutations = getUnsyncedMutations(actorId);
  const payload = {
    sales_person_id: actorId,
    device_id: deviceId,
    status,
    pending_count: summary.pending,
    syncing_count: summary.syncing,
    failed_count: summary.failed,
    protected_count: protectedCount,
    latest_error: truncateText(summary.latestError),
    user_agent: truncateText(navigator.userAgent),
    page_url: truncateText(window.location.href),
    last_seen_at: timestamp,
    last_attempt_at: timestamp,
    ...(status === "clean" ? { last_success_at: timestamp } : {}),
  };

  try {
    const supabase = createSupabaseBrowserClient();

    await supabase
      .from("sync_device_health")
      .upsert(payload, { onConflict: "sales_person_id,device_id" });

    const recoverySignature = JSON.stringify({
      actorId,
      deviceId,
      mutations: unsyncedMutations.map((mutation) => [
        mutation.id,
        mutation.kind,
        mutation.status,
        mutation.attempts,
        mutation.updatedAt,
        mutation.lastError,
      ]),
    });

    if (recoverySignature !== lastSnapshotSignature || protectedCount === 0) {
      if (protectedCount === 0) {
        await supabase
          .from("sync_recovery_snapshots")
          .delete()
          .match({ sales_person_id: actorId, device_id: deviceId });
      } else {
        await supabase.from("sync_recovery_snapshots").upsert(
          {
            sales_person_id: actorId,
            device_id: deviceId,
            pending_count: summary.pending + summary.syncing,
            failed_count: summary.failed,
            snapshot: buildRecoverySnapshot(actorId, unsyncedMutations),
            uploaded_at: timestamp,
          },
          { onConflict: "sales_person_id,device_id" },
        );
      }

      lastSnapshotSignature = recoverySignature;
    }
  } catch {
    // Sync health and recovery snapshots are advisory; core order sync must never depend on them.
  }
}
