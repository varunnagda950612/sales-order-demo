"use client";

import { useEffect, useState } from "react";

type SyncHealthSummary = {
  attentionCount: number;
  pending: number;
  syncing: number;
  failed: number;
  recoveryCount: number;
};

const refreshIntervalMs = 60_000;

function hasAttention(summary: SyncHealthSummary | null) {
  return Boolean(
    summary &&
      (summary.attentionCount > 0 ||
        summary.pending > 0 ||
        summary.syncing > 0 ||
        summary.failed > 0 ||
        summary.recoveryCount > 0),
  );
}

function getBadgeLabel(summary: SyncHealthSummary) {
  if (summary.failed > 0) {
    return `${summary.failed} failed sync record${summary.failed === 1 ? "" : "s"}`;
  }

  const pendingCount = Math.max(
    summary.pending + summary.syncing,
    summary.recoveryCount,
  );

  return `${pendingCount} pending sync record${pendingCount === 1 ? "" : "s"}`;
}

type SyncHealthNavBadgeProps = {
  active?: boolean;
};

export function SyncHealthNavBadge({ active = false }: SyncHealthNavBadgeProps) {
  const [summary, setSummary] = useState<SyncHealthSummary | null>(null);

  useEffect(() => {
    let isActive = true;
    let abortController: AbortController | null = null;

    async function refresh() {
      abortController?.abort();
      abortController = new AbortController();

      try {
        const response = await fetch("/api/admin/sync-health/summary", {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as SyncHealthSummary;

        if (isActive) {
          setSummary(data);
        }
      } catch {
        // The badge is advisory. Sync Health page remains the source of detail.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    void refresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refresh);
    const intervalId = window.setInterval(refresh, refreshIntervalMs);

    return () => {
      isActive = false;
      abortController?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refresh);
      window.clearInterval(intervalId);
    };
  }, []);

  if (!hasAttention(summary)) {
    return null;
  }

  const count = summary?.failed
    ? summary.failed
    : Math.max(
        (summary?.pending || 0) + (summary?.syncing || 0),
        summary?.recoveryCount || 0,
      );
  const label = summary ? getBadgeLabel(summary) : "Sync records need attention";
  const isFailed = Boolean(summary?.failed);

  return (
    <span
      className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
        isFailed
          ? active
            ? "bg-white text-red-700"
            : "bg-red-100 text-red-700"
          : active
            ? "bg-white text-amber-800"
            : "bg-amber-100 text-amber-800"
      }`}
      title={label}
      aria-label={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
