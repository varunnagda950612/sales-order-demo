"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripHorizontal, RefreshCw, X } from "lucide-react";
import { coreOutboxChangedEvent, getCoreSyncSummary } from "@/lib/sync/core-outbox";
import { requestCoreSync } from "@/lib/sync/core-sync";

const updateCheckIntervalMs = 20_000;
const idleBeforeUpdateMs = 60_000;
const pendingUpdateCheckMs = 3_000;
const updateProbeTimeoutMs = 10_000;
const recentReloadWindowMs = 12 * 60 * 60_000;
const reloadRetryCooldownMs = 45_000;
const maxAutomaticReloadAttempts = 3;
const dismissNoticeMs = 10 * 60_000;
const reloadAttemptStorageKey = "manish-masala-next.pwa-update-reload-attempt.v1";
const manualUpdateEvent = "manish-masala-next.apply-pwa-update";
const minimumNoticeBottomPx = 16;
const hardReloadParam = "app-refresh";
const appVersionEndpoint = "/api/app-version";

type UpdateNotice = {
  reason: string;
  protectedCount: number;
  canUpdateNow: boolean;
  isUpdating: boolean;
};

type UpdateBlocker = {
  reason: string;
  protectedCount: number;
  silent?: boolean;
};

type ReloadAttemptState = {
  signature?: unknown;
  attemptedAt?: unknown;
  count?: unknown;
};

type ServerAppVersionResponse = {
  version?: unknown;
};

function getCurrentAppVersion() {
  return document.body.dataset.appVersion || "";
}

function collectBuildAssetsFromDocument() {
  return Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[href]"))
    .map((element) => element.getAttribute("src") || element.getAttribute("href") || "")
    .filter((asset) => asset.includes("/_next/static/"))
    .sort()
    .join("|");
}

function collectBuildAssetsFromHtml(html: string) {
  return Array.from(html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g))
    .map((match) => match[1])
    .sort()
    .join("|");
}

function makeUpdateProbeUrl() {
  const url = new URL(window.location.pathname || "/", window.location.origin);
  url.searchParams.set("app-update", Date.now().toString());
  return url.toString();
}

function clearHardReloadParam() {
  const url = new URL(window.location.href);

  if (!url.searchParams.has(hardReloadParam)) {
    return;
  }

  url.searchParams.delete(hardReloadParam);
  window.history.replaceState(null, "", url.toString());
}

function hardReloadCurrentPage() {
  const url = new URL(window.location.href);
  url.searchParams.set(hardReloadParam, Date.now().toString());
  window.location.replace(url.toString());
}

function isFormElementFocused() {
  const activeElement = document.activeElement;

  return Boolean(
    activeElement?.closest?.("input, select, textarea, [contenteditable='true']"),
  );
}

function hasBlockingOverlay() {
  return Boolean(
    document.querySelector("[role='dialog'], [aria-modal='true'], .fixed.inset-0"),
  );
}

function readReloadAttemptState(signature: string) {
  try {
    const rawValue = window.localStorage.getItem(reloadAttemptStorageKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as ReloadAttemptState;

    if (parsed.signature !== signature || typeof parsed.attemptedAt !== "number") {
      return null;
    }

    return {
      attemptedAt: parsed.attemptedAt,
      count: typeof parsed.count === "number" ? parsed.count : 1,
    };
  } catch {
    return null;
  }
}

function writeReloadAttempt(signature: string) {
  try {
    const previousAttempt = readReloadAttemptState(signature);
    const isRecentAttempt =
      previousAttempt &&
      Date.now() - previousAttempt.attemptedAt < recentReloadWindowMs;

    window.localStorage.setItem(
      reloadAttemptStorageKey,
      JSON.stringify({
        signature,
        attemptedAt: Date.now(),
        count: isRecentAttempt ? previousAttempt.count + 1 : 1,
      }),
    );
  } catch {
    // A reload can continue even if localStorage is unavailable.
  }
}

function canAutoReloadForSignature(signature: string) {
  const previousAttempt = readReloadAttemptState(signature);

  if (!previousAttempt) {
    return true;
  }

  const ageMs = Date.now() - previousAttempt.attemptedAt;

  if (ageMs >= recentReloadWindowMs) {
    return true;
  }

  return previousAttempt.count < maxAutomaticReloadAttempts && ageMs >= reloadRetryCooldownMs;
}

async function fetchNextBuildSignature() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), updateProbeTimeoutMs);

  try {
    const response = await fetch(makeUpdateProbeUrl(), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    return collectBuildAssetsFromHtml(await response.text());
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchServerAppVersion() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), updateProbeTimeoutMs);

  try {
    const url = new URL(appVersionEndpoint, window.location.origin);
    url.searchParams.set("checkedAt", Date.now().toString());

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    const payload = (await response.json()) as ServerAppVersionResponse;

    return typeof payload.version === "string" ? payload.version : "";
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function cleanupPwaUpdateAssets() {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => new URL(registration.scope).origin === window.location.origin)
          .map((registration) => registration.unregister()),
      );
    } catch {
      // Service worker cleanup is best-effort; the reload still fetches the current app shell.
    }
  }

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    } catch {
      // Cache cleanup is best-effort and must never block protected data.
    }
  }
}

export function PwaUpdateGuard() {
  const [notice, setNotice] = useState<UpdateNotice | null>(null);
  const [noticeBottom, setNoticeBottom] = useState(minimumNoticeBottomPx);
  const lastActivityAtRef = useRef(0);
  const pendingSignatureRef = useRef("");
  const isCheckingRef = useRef(false);
  const isReloadingRef = useRef(false);
  const pwaCleanupDoneRef = useRef(false);
  const dismissedUntilRef = useRef(0);
  const dragStateRef = useRef<{ startY: number; startBottom: number } | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    clearHardReloadParam();
    lastActivityAtRef.current = Date.now();

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
    };

    const getUpdateBlocker = (forceIdle = false): UpdateBlocker | null => {
      if (!navigator.onLine) {
        return { reason: "Waiting for internet before updating.", protectedCount: 0 };
      }

      const summary = getCoreSyncSummary();
      const protectedCount = summary.pending + summary.syncing + summary.failed;

      if (protectedCount > 0) {
        if (summary.failed === 0) {
          requestCoreSync();
        }

        return {
          reason:
            summary.failed > 0
              ? "Sync failed on this device. Open Sync Health before updating."
              : "Waiting for pending records to sync before updating.",
          protectedCount,
        };
      }

      if (hasBlockingOverlay() || isFormElementFocused()) {
        return {
          reason: "Waiting for the current form or dialog to close.",
          protectedCount,
          silent: true,
        };
      }

      if (!forceIdle && Date.now() - lastActivityAtRef.current < idleBeforeUpdateMs) {
        return { reason: "New version ready. App will update after 1 minute idle.", protectedCount };
      }

      return null;
    };

    const applyUpdateIfSafe = async (forceIdle = false, forceReload = false) => {
      const pendingSignature = pendingSignatureRef.current;

      if (!pendingSignature || isReloadingRef.current) {
        return;
      }

      const blocker = getUpdateBlocker(forceIdle);

      if (blocker) {
        if (blocker.silent || Date.now() < dismissedUntilRef.current) {
          setNotice(null);
          return;
        }

        setNotice({
          reason: blocker.reason,
          protectedCount: blocker.protectedCount,
          canUpdateNow: blocker.protectedCount === 0 && !hasBlockingOverlay() && !isFormElementFocused(),
          isUpdating: false,
        });
        return;
      }

      if (!forceReload && !canAutoReloadForSignature(pendingSignature)) {
        setNotice({
          reason:
            "A new version is live, but this installed app has already tried to refresh. Tap update or close and reopen the app.",
          protectedCount: 0,
          canUpdateNow: true,
          isUpdating: false,
        });
        return;
      }

      isReloadingRef.current = true;
      setNotice({
        reason: "Updating app...",
        protectedCount: 0,
        canUpdateNow: false,
        isUpdating: true,
      });
      writeReloadAttempt(pendingSignature);
      await cleanupPwaUpdateAssets();
      hardReloadCurrentPage();
    };

    const cleanupLegacyAssetsWhenSafe = async () => {
      if (pwaCleanupDoneRef.current || pendingSignatureRef.current) {
        return;
      }

      if (getUpdateBlocker()) {
        return;
      }

      pwaCleanupDoneRef.current = true;
      await cleanupPwaUpdateAssets();
    };

    const checkForUpdate = async () => {
      if (
        isCheckingRef.current ||
        isReloadingRef.current ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      ) {
        return;
      }

      isCheckingRef.current = true;

      try {
        const currentVersion = getCurrentAppVersion();
        const serverVersion = await fetchServerAppVersion();

        if (currentVersion && serverVersion && serverVersion !== currentVersion) {
          pendingSignatureRef.current = `version:${serverVersion}`;
          await applyUpdateIfSafe(true);
          return;
        }

        const currentSignature = collectBuildAssetsFromDocument();

        if (!currentSignature) {
          return;
        }

        const nextSignature = await fetchNextBuildSignature();

        if (
          nextSignature &&
          nextSignature !== currentSignature
        ) {
          pendingSignatureRef.current = nextSignature;
          await applyUpdateIfSafe(true);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    const applyPendingWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
        void applyUpdateIfSafe();
      }
    };
    const applyPendingUpdate = () => {
      void applyUpdateIfSafe(true);
      void cleanupLegacyAssetsWhenSafe();
    };
    const applyManualUpdate = () => {
      void applyUpdateIfSafe(true, true);
    };

    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity, { passive: true });
    window.addEventListener("scroll", markActivity, { passive: true });
    window.addEventListener("input", markActivity);
    window.addEventListener("focus", applyPendingUpdate);
    window.addEventListener(manualUpdateEvent, applyManualUpdate);
    window.addEventListener(coreOutboxChangedEvent, applyPendingUpdate);
    window.addEventListener("online", applyPendingWhenVisible);
    document.addEventListener("visibilitychange", applyPendingWhenVisible);

    const updateCheckIntervalId = window.setInterval(checkForUpdate, updateCheckIntervalMs);
    const pendingUpdateIntervalId = window.setInterval(applyPendingUpdate, pendingUpdateCheckMs);
    const initialCheckId = window.setTimeout(checkForUpdate, 5_000);

    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
      window.removeEventListener("scroll", markActivity);
      window.removeEventListener("input", markActivity);
      window.removeEventListener("focus", applyPendingUpdate);
      window.removeEventListener(manualUpdateEvent, applyManualUpdate);
      window.removeEventListener(coreOutboxChangedEvent, applyPendingUpdate);
      window.removeEventListener("online", applyPendingWhenVisible);
      document.removeEventListener("visibilitychange", applyPendingWhenVisible);
      window.clearInterval(updateCheckIntervalId);
      window.clearInterval(pendingUpdateIntervalId);
      window.clearTimeout(initialCheckId);
    };
  }, []);

  if (!notice) {
    return null;
  }

  function clampNoticeBottom(value: number) {
    if (typeof window === "undefined") {
      return value;
    }

    return Math.min(Math.max(value, minimumNoticeBottomPx), Math.max(window.innerHeight - 180, minimumNoticeBottomPx));
  }

  function handleDragStart(event: PointerEvent<HTMLButtonElement>) {
    dragStateRef.current = {
      startY: event.clientY,
      startBottom: noticeBottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragStateRef.current) {
      return;
    }

    const nextBottom =
      dragStateRef.current.startBottom + (dragStateRef.current.startY - event.clientY);
    setNoticeBottom(clampNoticeBottom(nextBottom));
  }

  function handleDragEnd(event: PointerEvent<HTMLButtonElement>) {
    dragStateRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDismiss() {
    dismissedUntilRef.current = Date.now() + dismissNoticeMs;
    setNotice(null);
  }

  return (
    <div
      className="fixed left-4 z-[90] max-w-[calc(100vw-2rem)] rounded-lg border border-orange-200 bg-white p-3 text-sm text-stone-800 shadow-xl shadow-stone-950/15 sm:left-5 sm:max-w-sm"
      style={{ bottom: noticeBottom }}
    >
      <div className="-mx-1 -mt-1 mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="inline-flex flex-1 touch-none cursor-grab items-center justify-center rounded-md px-2 py-1 text-stone-400 active:cursor-grabbing"
          aria-label="Drag update notice"
        >
          <GripHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100"
          aria-label="Hide update notice"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-start gap-3">
        <RefreshCw
          className={`mt-0.5 h-5 w-5 shrink-0 text-orange-600 ${notice.isUpdating ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-stone-950">App update ready</p>
          <p className="mt-1 text-stone-600">{notice.reason}</p>
          {notice.protectedCount > 0 ? (
            <p className="mt-1 text-xs font-bold text-red-700">
              {notice.protectedCount} protected record{notice.protectedCount === 1 ? "" : "s"} on
              this device.
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        disabled={!notice.canUpdateNow || notice.isUpdating}
        onClick={() => window.dispatchEvent(new Event(manualUpdateEvent))}
        className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-orange-600 px-3 py-2 font-bold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        Update now
      </button>
    </div>
  );
}
