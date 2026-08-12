"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { runBrowserStorageMaintenance } from "@/lib/browser/storage-maintenance";
import { deleteLocalCollection } from "@/lib/local/collections";
import { deleteLocalOrder } from "@/lib/local/orders";
import {
  removeCoreCollectionMutations,
  removeCoreOrderMutations,
} from "@/lib/sync/core-outbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LiveDataRefreshTable =
  | string
  | {
      table: string;
      filter?: string;
    };

type LiveDataRefreshProps = {
  tables: readonly LiveDataRefreshTable[];
  enabled?: boolean;
  debounceMs?: number;
  pollIntervalMs?: number;
  minimumRefreshGapMs?: number;
  autoRefresh?: boolean;
  noticeLabel?: string;
  refreshEventName?: string;
  clearDeletedOrderState?: boolean;
  clearDeletedCollectionState?: boolean;
};

const minimumPollIntervalMs = 60_000;
const defaultMinimumRefreshGapMs = 30_000;

function normalizeTable(tableConfig: LiveDataRefreshTable) {
  return typeof tableConfig === "string" ? { table: tableConfig } : tableConfig;
}

export function LiveDataRefresh({
  tables,
  enabled = true,
  debounceMs = 750,
  pollIntervalMs = 600_000,
  minimumRefreshGapMs = defaultMinimumRefreshGapMs,
  autoRefresh = true,
  noticeLabel = "New data available",
  refreshEventName,
  clearDeletedOrderState = false,
  clearDeletedCollectionState = false,
}: LiveDataRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingChangeCount, setPendingChangeCount] = useState(0);
  const [isManualRefreshPending, startManualRefreshTransition] = useTransition();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const tableConfigs = useMemo(() => tables.map(normalizeTable), [tables]);
  const tableKey = useMemo(
    () => tableConfigs.map((config) => `${config.table}:${config.filter || ""}`).join(","),
    [tableConfigs],
  );

  const requestRefresh = useCallback(
    (delayMs = debounceMs, isDataChange = false) => {
      if (!autoRefresh) {
        if (isDataChange) {
          setPendingChangeCount((count) => Math.min(count + 1, 99));
        }

        return;
      }

      if (document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAtRef.current < minimumRefreshGapMs) {
        return;
      }

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        lastRefreshAtRef.current = Date.now();
        runBrowserStorageMaintenance({ level: "normal", reason: "live-refresh" });

        if (refreshEventName) {
          window.dispatchEvent(
            new CustomEvent(refreshEventName, {
              detail: { isDataChange, tableKey },
            }),
          );
          return;
        }

        startTransition(() => router.refresh());
      }, delayMs);
    },
    [autoRefresh, debounceMs, minimumRefreshGapMs, refreshEventName, router, tableKey],
  );

  const handleManualRefresh = useCallback(() => {
    setPendingChangeCount(0);
    lastRefreshAtRef.current = Date.now();
    runBrowserStorageMaintenance({ level: "normal", reason: "manual-live-refresh" });

    if (refreshEventName) {
      window.dispatchEvent(
        new CustomEvent(refreshEventName, {
          detail: { isDataChange: false, tableKey },
        }),
      );
      return;
    }

    startManualRefreshTransition(() => router.refresh());
  }, [refreshEventName, router, tableKey]);

  useEffect(() => {
    if (!enabled || !tableKey) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`live-data-refresh:${tableKey}`);

    tableConfigs.forEach(({ table, filter }) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload) => {
          if (clearDeletedOrderState && table === "orders" && payload.eventType === "DELETE") {
            const deletedOrderId = (payload.old as { id?: unknown }).id;

            if (typeof deletedOrderId === "string") {
              try {
                removeCoreOrderMutations(deletedOrderId);
                deleteLocalOrder(deletedOrderId);
              } catch {
                // The refreshed server state still removes the deleted order from view.
              }
            }
          }

          if (
            clearDeletedCollectionState &&
            table === "collections" &&
            payload.eventType === "DELETE"
          ) {
            const oldCollection = payload.old as {
              id?: unknown;
              client_group_id?: unknown;
            };
            const deletedCollectionId =
              typeof oldCollection.client_group_id === "string"
                ? oldCollection.client_group_id
                : oldCollection.id;

            if (typeof deletedCollectionId === "string") {
              try {
                removeCoreCollectionMutations(deletedCollectionId);
                deleteLocalCollection(deletedCollectionId);
              } catch {
                // The refreshed server state still removes the deleted collection from view.
              }
            }
          }

          requestRefresh(debounceMs, true);
        },
      );
    });

    channel.subscribe();

    const refreshWhenActive = () => requestRefresh(0);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshWhenActive();
      }
    };
    const intervalId = autoRefresh
      ? window.setInterval(
          refreshWhenActive,
          Math.max(pollIntervalMs, minimumPollIntervalMs),
        )
      : null;

    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [
    clearDeletedCollectionState,
    clearDeletedOrderState,
    enabled,
    autoRefresh,
    debounceMs,
    pollIntervalMs,
    requestRefresh,
    tableConfigs,
    tableKey,
  ]);

  if (!pendingChangeCount) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-5 z-40 sm:right-6">
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isManualRefreshPending}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-bold text-orange-700 shadow-lg shadow-orange-950/10 transition-colors hover:bg-orange-50 disabled:cursor-wait disabled:text-stone-500"
      >
        <RefreshCw
          className={`h-4 w-4 ${isManualRefreshPending ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {isManualRefreshPending ? "Refreshing..." : noticeLabel}
        {pendingChangeCount > 1 ? (
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs text-white">
            {pendingChangeCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
