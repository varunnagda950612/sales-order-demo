import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { replayRecoverySnapshot } from "@/lib/sync/recovery-replay";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function readRequiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const profile = await getCurrentProfile(supabase);

    if (!profile || profile.role !== "admin" || !profile.active) {
      return jsonError("Only active admins can recover sync snapshots.", 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const salesPersonId = readRequiredString(body, "salesPersonId");
    const deviceId = readRequiredString(body, "deviceId");

    const { data, error } = await supabase
      .from("sync_recovery_snapshots")
      .select("snapshot")
      .match({ sales_person_id: salesPersonId, device_id: deviceId })
      .maybeSingle();

    if (error) {
      return jsonError(error.message, 500);
    }

    if (!data) {
      return jsonError("Recovery snapshot was not found for this device.", 404);
    }

    const result = await replayRecoverySnapshot(supabase, data.snapshot);

    if (result.failedCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          result,
          error:
            "Recovery replay completed with failures. The snapshot was kept for review.",
        },
        { status: 409 },
      );
    }

    const { error: deleteSnapshotError } = await supabase
      .from("sync_recovery_snapshots")
      .delete()
      .match({ sales_person_id: salesPersonId, device_id: deviceId });

    if (deleteSnapshotError) {
      return jsonError(deleteSnapshotError.message, 500);
    }

    const { error: deleteHealthError } = await supabase
      .from("sync_device_health")
      .delete()
      .match({ sales_person_id: salesPersonId, device_id: deviceId });

    if (deleteHealthError) {
      return jsonError(deleteHealthError.message, 500);
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to recover sync snapshot.",
      500,
    );
  }
}
