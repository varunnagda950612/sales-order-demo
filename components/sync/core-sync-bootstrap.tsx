"use client";

import { useEffect } from "react";
import { runBrowserStorageMaintenance } from "@/lib/browser/storage-maintenance";
import { isLocalAppMode } from "@/lib/config/app-mode";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { coreOutboxStorageKey, hydrateCoreOutboxFromBackup } from "@/lib/sync/core-outbox";
import { requestCoreSync } from "@/lib/sync/core-sync";

export function CoreSyncBootstrap() {
  useEffect(() => {
    let isActive = true;

    const reconcile = async () => {
      try {
        await hydrateCoreOutboxFromBackup();
      } catch {
        // The primary queue remains untouched; a later visibility or online event retries recovery.
      }

      if (isActive) {
        runBrowserStorageMaintenance({ level: "normal", reason: "bootstrap" });
        requestCoreSync();
      }
    };
    const handleOnline = () => requestCoreSync();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcile();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === coreOutboxStorageKey) {
        void reconcile();
      }
    };
    let unsubscribeAuth: (() => void) | undefined;

    if (!isLocalAppMode()) {
      try {
        const {
          data: { subscription },
        } = createSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            void reconcile();
          }
        });
        unsubscribeAuth = () => subscription.unsubscribe();
      } catch {
        // The next route load retries once browser Supabase configuration is available.
      }
    }

    void reconcile();
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);
    const intervalId = window.setInterval(requestCoreSync, 60_000);

    return () => {
      isActive = false;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(intervalId);
      unsubscribeAuth?.();
    };
  }, []);

  return null;
}
