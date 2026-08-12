"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";

type SyncRecoveryReplayButtonProps = {
  salesPersonId: string;
  deviceId: string;
  salesPersonName: string;
  recordCount: number;
};

type ReplayResponse = {
  ok?: boolean;
  error?: string;
  result?: {
    recoveredCount: number;
    failedCount: number;
    errors: string[];
  };
};

async function parseReplayResponse(response: Response) {
  const data = (await response.json().catch(() => ({}))) as ReplayResponse;

  if (!response.ok || !data.ok) {
    const detail = data.result?.errors?.length
      ? ` ${data.result.errors.slice(0, 2).join(" ")}`
      : "";

    throw new Error(`${data.error || "Recovery replay failed."}${detail}`);
  }

  return data;
}

export function SyncRecoveryReplayButton({
  salesPersonId,
  deviceId,
  salesPersonName,
  recordCount,
}: SyncRecoveryReplayButtonProps) {
  const router = useRouter();
  const [isRecovering, setIsRecovering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRecover() {
    const confirmed = window.confirm(
      `Recover ${recordCount} protected record${recordCount === 1 ? "" : "s"} for ${salesPersonName} into Supabase?\n\nThis replays the stored recovery snapshot through the normal order, collection, and visit sync functions. The recovery row is cleared only if all records replay successfully.`,
    );

    if (!confirmed) {
      return;
    }

    setIsRecovering(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/sync-recovery/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesPersonId, deviceId }),
      });
      const data = await parseReplayResponse(response);
      const recoveredCount = data.result?.recoveredCount || 0;

      setMessage(`${recoveredCount} record${recoveredCount === 1 ? "" : "s"} recovered.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery replay failed.");
    } finally {
      setIsRecovering(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isRecovering}
        onClick={() => void handleRecover()}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-emerald-400"
      >
        <DatabaseZap className="h-3.5 w-3.5" aria-hidden="true" />
        {isRecovering ? "Recovering" : "Recover"}
      </button>
      {message ? <p className="max-w-52 text-xs font-medium text-slate-600">{message}</p> : null}
    </div>
  );
}
