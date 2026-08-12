"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { SyncHealthDevice } from "@/lib/repositories/sync-health";

type SyncHealthDeleteButtonProps = {
  row: Pick<
    SyncHealthDevice,
    | "id"
    | "salesPersonId"
    | "salesPersonName"
    | "deviceId"
    | "pendingCount"
    | "syncingCount"
    | "failedCount"
    | "protectedCount"
    | "recoveryPendingCount"
    | "recoveryFailedCount"
    | "recoverySnapshot"
  >;
  includeRecoveryCleanup: boolean;
};

function hasProtectedData(row: SyncHealthDeleteButtonProps["row"]) {
  return (
    row.pendingCount > 0 ||
    row.syncingCount > 0 ||
    row.failedCount > 0 ||
    row.protectedCount > 0 ||
    row.recoveryPendingCount > 0 ||
    row.recoveryFailedCount > 0 ||
    Boolean(row.recoverySnapshot)
  );
}

function getShortDeviceId(deviceId: string) {
  return deviceId.length > 12 ? `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}` : deviceId;
}

export function SyncHealthDeleteButton({
  row,
  includeRecoveryCleanup,
}: SyncHealthDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const disabled = isDeleting || hasProtectedData(row);

  async function handleDelete() {
    if (disabled) {
      return;
    }

    const confirmed = window.confirm(
      `Delete this sync health device row for ${row.salesPersonName}?\n\nThis only removes the device heartbeat entry. It does not delete orders, collections, visits, or salesperson data.`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);
    setIsDeleting(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (includeRecoveryCleanup) {
        const { error: recoveryError } = await supabase
          .from("sync_recovery_snapshots")
          .delete()
          .match({ sales_person_id: row.salesPersonId, device_id: row.deviceId });

        if (recoveryError) {
          throw recoveryError;
        }
      }

      const { error } = await supabase
        .from("sync_device_health")
        .delete()
        .eq("id", row.id);

      if (error) {
        throw error;
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this sync health row.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleDelete()}
        title={
          disabled
            ? "Rows with pending, syncing, failed, protected, or recovery records cannot be deleted."
            : `Delete ${getShortDeviceId(row.deviceId)}`
        }
        className="inline-flex items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {isDeleting ? "Deleting" : "Delete"}
      </button>
      {message ? <p className="max-w-40 text-xs font-medium text-red-700">{message}</p> : null}
    </div>
  );
}
