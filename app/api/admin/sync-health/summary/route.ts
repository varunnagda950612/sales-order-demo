import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SyncHealthSummaryRow = {
  status: string | null;
  pending_count: number | string | null;
  syncing_count: number | string | null;
  failed_count: number | string | null;
  protected_count: number | string | null;
};

type RecoverySummaryRow = {
  pending_count: number | string | null;
  failed_count: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const profile = await getCurrentProfile(supabase);

    if (
      !profile ||
      !profile.active ||
      (profile.role !== "admin" && profile.role !== "manager")
    ) {
      return jsonError("Admin or manager access is required.", 403);
    }

    const { data, error } = await supabase
      .from("sync_device_health")
      .select("status, pending_count, syncing_count, failed_count, protected_count");

    if (error) {
      return jsonError(error.message, 500);
    }

    const recoveryResponse = await supabase
      .from("sync_recovery_snapshots")
      .select("pending_count, failed_count");

    const rows = (data || []) as SyncHealthSummaryRow[];
    const recoveryRows = recoveryResponse.error
      ? []
      : ((recoveryResponse.data || []) as RecoverySummaryRow[]);

    const summary = rows.reduce(
      (totals, row) => {
        const pending = toNumber(row.pending_count);
        const syncing = toNumber(row.syncing_count);
        const failed = toNumber(row.failed_count);
        const protectedCount = toNumber(row.protected_count);
        const hasAttention =
          pending > 0 ||
          syncing > 0 ||
          failed > 0 ||
          protectedCount > 0 ||
          row.status === "pending" ||
          row.status === "syncing" ||
          row.status === "failed";

        return {
          devices: totals.devices + 1,
          attentionDevices: totals.attentionDevices + (hasAttention ? 1 : 0),
          pending: totals.pending + pending,
          syncing: totals.syncing + syncing,
          failed: totals.failed + failed,
          protectedCount: totals.protectedCount + protectedCount,
        };
      },
      {
        devices: 0,
        attentionDevices: 0,
        pending: 0,
        syncing: 0,
        failed: 0,
        protectedCount: 0,
      },
    );

    const recoveryCount = recoveryRows.reduce(
      (total, row) =>
        total + toNumber(row.pending_count) + toNumber(row.failed_count),
      0,
    );

    return NextResponse.json(
      {
        ...summary,
        recoveryCount,
        attentionCount:
          summary.pending +
          summary.syncing +
          summary.failed +
          Math.max(recoveryCount - summary.protectedCount, 0),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=20",
        },
      },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to read sync health summary.",
      500,
    );
  }
}
