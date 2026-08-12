"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { readLocalCollections } from "@/lib/local/collections";
import { readLocalOrders } from "@/lib/local/orders";
import { readLocalVisitRecords } from "@/lib/local/visit-proofs";
import {
  coreOutboxChangedEvent,
  discardReviewedProtectedCoreMutations,
  discardReviewedDuplicateOrderFailures,
  getDiscardableDuplicateOrderFailureCount,
  getInterruptedCoreMutationCount,
  getCoreMutationActorId,
  getCoreSyncSummary,
  hydrateCoreOutboxFromBackup,
  readCoreOutbox,
  readCoreOutboxBackupFromIndexedDb,
  resetInterruptedCoreMutations,
  type CoreSyncSummary,
  waitForCoreOutboxBackupMirror,
} from "@/lib/sync/core-outbox";
import { requestCoreSync, retryFailedCoreMutations } from "@/lib/sync/core-sync";
import { getSyncHealthDeviceId, reportSyncHealth } from "@/lib/sync/sync-health";

type CoreSyncStatusProps = {
  actorId: string;
  writesEnabled: boolean;
  localMode: boolean;
};

const emptySummary: CoreSyncSummary = {
  pending: 0,
  syncing: 0,
  failed: 0,
  latestError: null,
};

function readRelevantLocalStorage() {
  const entries: Record<string, string | null> = {};

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith("manish-masala-next.")) {
      entries[key] = window.localStorage.getItem(key);
    }
  }

  return entries;
}

async function getStorageEstimate() {
  try {
    return navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null;
  } catch {
    return null;
  }
}

async function downloadRecoveryCopy(actorId: string) {
  const outbox = readCoreOutbox().filter(
    (mutation) => getCoreMutationActorId(mutation) === actorId,
  );
  const indexedDbOutbox = (await readCoreOutboxBackupFromIndexedDb()).filter(
    (mutation) => getCoreMutationActorId(mutation) === actorId,
  );
  const snapshot = {
    app: "manish-masala-sales-order-app",
    version: 2,
    exportedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    actorId,
    storageEstimate: await getStorageEstimate(),
    pending: {
      outbox: outbox.filter((mutation) => mutation.status !== "synced"),
      orders: outbox.flatMap((mutation) =>
        mutation.kind === "order" && mutation.status !== "synced"
          ? [mutation.payload.order]
          : [],
      ),
      collections: outbox.flatMap((mutation) =>
        mutation.kind === "collection" && mutation.status !== "synced"
          ? [mutation.payload.collection]
          : [],
      ),
      visitProofs: outbox
        .filter((mutation) => mutation.status !== "synced")
        .flatMap((mutation) => {
          if (mutation.kind === "visit") {
            return [mutation.payload.visit];
          }

          if (mutation.kind === "order" && mutation.payload.orderStartedVisit) {
            return [mutation.payload.orderStartedVisit];
          }

          return [];
        }),
    },
    indexedDb: {
      coreOutbox: indexedDbOutbox,
    },
    localStorage: readRelevantLocalStorage(),
    legacyLocalRecovery: {
      orders: readLocalOrders().filter(
        (order) => order.salesPersonId === actorId,
      ),
      collections: readLocalCollections().filter(
        (collection) => collection.salesPersonId === actorId,
      ),
      visitProofs: readLocalVisitRecords().filter(
        (visit) => visit.salesPersonId === actorId,
      ),
    },
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `manish-masala-core-recovery-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CoreSyncStatus({ actorId, writesEnabled, localMode }: CoreSyncStatusProps) {
  const [summary, setSummary] = useState<CoreSyncSummary>(emptySummary);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDiscardingDuplicate, setIsDiscardingDuplicate] = useState(false);
  const [isDiscardingReviewed, setIsDiscardingReviewed] = useState(false);
  const [isResumingInterrupted, setIsResumingInterrupted] = useState(false);
  const [isCheckingQueue, setIsCheckingQueue] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [discardableDuplicateCount, setDiscardableDuplicateCount] = useState(0);
  const [interruptedSyncingCount, setInterruptedSyncingCount] = useState(0);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);

  useEffect(() => {
    let isActive = true;
    const refresh = () => {
      if (isActive) {
        const nextSummary = getCoreSyncSummary(actorId);
        setSummary(nextSummary);
        setDiscardableDuplicateCount(getDiscardableDuplicateOrderFailureCount(actorId));
        setInterruptedSyncingCount(getInterruptedCoreMutationCount(actorId));
        void reportSyncHealth({
          actorId,
          summary: nextSummary,
          writesEnabled,
          localMode,
        });
      }
    };
    const hydrate = async () => {
      try {
        setIsCheckingQueue(true);
        await hydrateCoreOutboxFromBackup();
      } finally {
        refresh();
        if (isActive) {
          setIsCheckingQueue(false);
          setDeviceId(getSyncHealthDeviceId());
        }
      }
    };
    const handleOnline = () => {
      requestCoreSync();
      refresh();
    };

    void hydrate();
    window.addEventListener(coreOutboxChangedEvent, refresh);
    window.addEventListener("online", handleOnline);
    const intervalId = window.setInterval(refresh, 60_000);

    return () => {
      isActive = false;
      window.removeEventListener(coreOutboxChangedEvent, refresh);
      window.removeEventListener("online", handleOnline);
      window.clearInterval(intervalId);
    };
  }, [actorId, localMode, writesEnabled]);

  if (localMode) {
    return null;
  }

  const protectedCount = summary.pending + summary.syncing + summary.failed;
  const hasFailure = summary.failed > 0;
  const isClean = protectedCount === 0;
  const shortDeviceId = deviceId.length > 12 ? `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}` : deviceId;

  async function handleRetry() {
    setIsRetrying(true);

    try {
      await retryFailedCoreMutations();
    } finally {
      setIsRetrying(false);
      const nextSummary = getCoreSyncSummary(actorId);
      setSummary(nextSummary);
      void reportSyncHealth({
        actorId,
        summary: nextSummary,
        writesEnabled,
        localMode,
      });
      setDiscardableDuplicateCount(getDiscardableDuplicateOrderFailureCount(actorId));
      setInterruptedSyncingCount(getInterruptedCoreMutationCount(actorId));
    }
  }

  async function handleResumeInterruptedSync() {
    setIsResumingInterrupted(true);

    try {
      const resetCount = resetInterruptedCoreMutations(actorId);
      const nextSummary = getCoreSyncSummary(actorId);
      setSummary(nextSummary);
      setDiscardableDuplicateCount(getDiscardableDuplicateOrderFailureCount(actorId));
      setInterruptedSyncingCount(getInterruptedCoreMutationCount(actorId));
      await reportSyncHealth({
        actorId,
        summary: nextSummary,
        writesEnabled,
        localMode,
      });

      if (resetCount > 0) {
        requestCoreSync();
      }
    } finally {
      setIsResumingInterrupted(false);
    }
  }

  async function handleDiscardReviewedDuplicate() {
    const confirmed = window.confirm(
      `Clear ${discardableDuplicateCount} reviewed duplicate order error${discardableDuplicateCount === 1 ? "" : "s"} from this device?\n\nUse this only after admin has checked the recovery copy and confirmed the existing Supabase order already has the required items. This does not delete any Supabase data.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDiscardingDuplicate(true);

    try {
      discardReviewedDuplicateOrderFailures(actorId);
      const nextSummary = getCoreSyncSummary(actorId);
      setSummary(nextSummary);
      setDiscardableDuplicateCount(getDiscardableDuplicateOrderFailureCount(actorId));
      setInterruptedSyncingCount(getInterruptedCoreMutationCount(actorId));
      await reportSyncHealth({
        actorId,
        summary: nextSummary,
        writesEnabled,
        localMode,
      });
    } finally {
      setIsDiscardingDuplicate(false);
    }
  }

  async function handleDiscardReviewedRecovery() {
    const confirmation = window.prompt(
      `This will permanently remove ${protectedCount} protected local record${protectedCount === 1 ? "" : "s"} from this device only.\n\nUse this only after the recovery copy has been downloaded and admin has confirmed the data is already recovered or no longer needed.\n\nType DISCARD to continue.`,
    );

    if (confirmation !== "DISCARD") {
      return;
    }

    setIsDiscardingReviewed(true);

    try {
      discardReviewedProtectedCoreMutations(actorId);
      await waitForCoreOutboxBackupMirror();
      const nextSummary = getCoreSyncSummary(actorId);
      setSummary(nextSummary);
      setDiscardableDuplicateCount(getDiscardableDuplicateOrderFailureCount(actorId));
      setInterruptedSyncingCount(getInterruptedCoreMutationCount(actorId));
      await reportSyncHealth({
        actorId,
        summary: nextSummary,
        writesEnabled,
        localMode,
      });
    } finally {
      setIsDiscardingReviewed(false);
    }
  }

  return (
    <section
      className={`rounded-lg border p-4 shadow-sm ${
        isCheckingQueue
          ? "border-slate-200 bg-slate-50"
          : hasFailure
          ? "border-red-200 bg-red-50"
          : isClean
            ? "border-emerald-200 bg-emerald-50"
            : "border-sky-200 bg-sky-50"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          {isCheckingQueue ? (
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-slate-500" aria-hidden="true" />
          ) : hasFailure ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          ) : isClean ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          ) : (
            <UploadCloud className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
          )}
          <div>
            <h2
              className={`text-sm font-bold ${
                isCheckingQueue
                  ? "text-slate-900"
                  : hasFailure
                  ? "text-red-900"
                  : isClean
                    ? "text-emerald-900"
                    : "text-sky-900"
              }`}
            >
              Sync status
            </h2>
            <p
              className={`mt-1 text-sm ${
                isCheckingQueue
                  ? "text-slate-700"
                  : hasFailure
                  ? "text-red-800"
                  : isClean
                    ? "text-emerald-800"
                    : "text-sky-800"
              }`}
            >
              {isCheckingQueue
                ? "Checking protected local queue..."
                : hasFailure
                ? `${summary.failed} protected record${summary.failed === 1 ? "" : "s"} need attention. Nothing has been discarded.`
                : isClean
                  ? "No pending or failed records are stored on this device."
                  : `${protectedCount} protected record${protectedCount === 1 ? "" : "s"} ${summary.syncing ? "are syncing" : "are waiting to sync"}.`}
            </p>
            {shortDeviceId ? (
              <p className="mt-1 text-xs text-slate-600">
                Device: <span className="font-mono">{shortDeviceId}</span>
              </p>
            ) : null}
            {summary.latestError ? (
              <p className="mt-1 text-xs text-red-800">{summary.latestError}</p>
            ) : null}
          </div>
        </div>
        {!isCheckingQueue && !isClean ? <div className="flex flex-wrap gap-2">
          {interruptedSyncingCount > 0 ? (
            <button
              type="button"
              disabled={isResumingInterrupted}
              onClick={() => void handleResumeInterruptedSync()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-bold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-sky-400"
            >
              <RefreshCw className={`h-4 w-4 ${isResumingInterrupted ? "animate-spin" : ""}`} aria-hidden="true" />
              {isResumingInterrupted ? "Resuming" : "Resume interrupted sync"}
            </button>
          ) : null}
          {hasFailure && writesEnabled ? (
            <button
              type="button"
              disabled={isRetrying}
              onClick={handleRetry}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:text-red-400"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
              Retry sync
            </button>
          ) : null}
          {discardableDuplicateCount > 0 ? (
            <button
              type="button"
              disabled={isDiscardingDuplicate}
              onClick={() => void handleDiscardReviewedDuplicate()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-amber-400"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {isDiscardingDuplicate ? "Clearing" : "Clear reviewed duplicate"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setRecoveryDownloaded(true);
              void downloadRecoveryCopy(actorId);
            }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download recovery copy
          </button>
          {recoveryDownloaded ? (
            <button
              type="button"
              disabled={isDiscardingReviewed}
              onClick={() => void handleDiscardReviewedRecovery()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-400"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {isDiscardingReviewed ? "Discarding" : "Discard downloaded records"}
            </button>
          ) : null}
        </div> : null}
      </div>
    </section>
  );
}
