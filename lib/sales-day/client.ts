import {
  endLocalSalesDay,
  reopenLocalSalesDay,
  resumeLocalSalesDay,
  startLocalLunchBreak,
  startLocalSalesDay,
  type SalesDayPosition,
} from "@/lib/local/sales-day-sessions";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { SalesDaySession, SalesDaySessionStatus } from "@/types/domain";

export type SalesDayAction =
  | "start_day"
  | "start_lunch"
  | "resume_day"
  | "reopen_day"
  | "end_day";

type SupabaseSalesDaySessionPayload = {
  id: string;
  sales_person_id: string;
  work_date: string;
  status: SalesDaySessionStatus | null;
  started_at: string;
  start_lat?: number | string | null;
  start_lng?: number | string | null;
  start_accuracy?: number | string | null;
  lunch_started_at: string | null;
  lunch_start_lat?: number | string | null;
  lunch_start_lng?: number | string | null;
  lunch_start_accuracy?: number | string | null;
  lunch_ended_at: string | null;
  lunch_end_lat?: number | string | null;
  lunch_end_lng?: number | string | null;
  lunch_end_accuracy?: number | string | null;
  ended_at: string | null;
  end_lat?: number | string | null;
  end_lng?: number | string | null;
  end_accuracy?: number | string | null;
  created_at: string;
  updated_at: string;
};

const actionRpcNames: Record<SalesDayAction, string> = {
  start_day: "start_sales_day",
  start_lunch: "start_sales_lunch_break",
  resume_day: "resume_sales_day",
  reopen_day: "reopen_sales_day",
  end_day: "end_sales_day",
};

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function mapSupabaseSession(
  row: SupabaseSalesDaySessionPayload,
): SalesDaySession {
  return {
    id: row.id,
    salesPersonId: row.sales_person_id,
    workDate: row.work_date,
    status: row.status || "active",
    startedAt: row.started_at,
    startLat: toNullableNumber(row.start_lat),
    startLng: toNullableNumber(row.start_lng),
    startAccuracy: toNullableNumber(row.start_accuracy),
    lunchStartedAt: row.lunch_started_at,
    lunchStartLat: toNullableNumber(row.lunch_start_lat),
    lunchStartLng: toNullableNumber(row.lunch_start_lng),
    lunchStartAccuracy: toNullableNumber(row.lunch_start_accuracy),
    lunchEndedAt: row.lunch_ended_at,
    lunchEndLat: toNullableNumber(row.lunch_end_lat),
    lunchEndLng: toNullableNumber(row.lunch_end_lng),
    lunchEndAccuracy: toNullableNumber(row.lunch_end_accuracy),
    endedAt: row.ended_at,
    endLat: toNullableNumber(row.end_lat),
    endLng: toNullableNumber(row.end_lng),
    endAccuracy: toNullableNumber(row.end_accuracy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function unwrapRpcSession(data: unknown) {
  if (Array.isArray(data)) {
    return data[0] as SupabaseSalesDaySessionPayload | undefined;
  }

  return data as SupabaseSalesDaySessionPayload | undefined;
}

function isMissingGpsRpcSignatureError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("could not find the function") ||
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("p_lat") ||
    normalizedMessage.includes("p_lng") ||
    normalizedMessage.includes("p_accuracy")
  );
}

export async function tryCaptureSalesDayPosition(): Promise<{
  position: SalesDayPosition | null;
  warning: string | null;
}> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      position: null,
      warning: "GPS was not captured because this device does not support location.",
    };
  }

  try {
    const position = await new Promise<SalesDayPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (browserPosition) => {
          resolve({
            latitude: browserPosition.coords.latitude,
            longitude: browserPosition.coords.longitude,
            accuracy: browserPosition.coords.accuracy,
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 12_000,
        },
      );
    });

    return { position, warning: null };
  } catch {
    return {
      position: null,
      warning: "GPS was not captured. The day status was saved without location.",
    };
  }
}

export async function runSalesDayAction({
  action,
  salesPersonId,
  workDate,
  localMode,
  position,
}: {
  action: SalesDayAction;
  salesPersonId: string;
  workDate: string;
  localMode: boolean;
  position?: SalesDayPosition | null;
}) {
  if (localMode) {
    if (action === "start_day") {
      return startLocalSalesDay(salesPersonId, workDate, position);
    }

    if (action === "start_lunch") {
      return startLocalLunchBreak(salesPersonId, workDate, position);
    }

    if (action === "resume_day") {
      return resumeLocalSalesDay(salesPersonId, workDate, position);
    }

    if (action === "reopen_day") {
      return reopenLocalSalesDay(salesPersonId, workDate);
    }

    return endLocalSalesDay(salesPersonId, workDate, position);
  }

  const supabase = createSupabaseBrowserClient();
  const rpcArgs = {
    p_work_date: workDate,
    p_lat: position?.latitude ?? null,
    p_lng: position?.longitude ?? null,
    p_accuracy: position?.accuracy ?? null,
  };
  let { data, error } = await supabase.rpc(actionRpcNames[action], rpcArgs);

  if (error && isMissingGpsRpcSignatureError(error.message)) {
    const fallbackResponse = await supabase.rpc(actionRpcNames[action], {
      p_work_date: workDate,
    });

    data = fallbackResponse.data;
    error = fallbackResponse.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const row = unwrapRpcSession(data);

  if (!row) {
    throw new Error("Day status was not returned by Supabase.");
  }

  return mapSupabaseSession(row);
}

export function canUseRouteWork(session: SalesDaySession | null | undefined) {
  return session?.status === "active";
}

export function getRouteWorkBlockMessage(
  session: SalesDaySession | null | undefined,
) {
  if (!session) {
    return "Start day before taking route orders, No Order visits, or route collections.";
  }

  if (session.status === "on_break") {
    return "Resume day after lunch break before taking route orders, No Order visits, or route collections.";
  }

  if (session.status === "ended") {
    return "This work day is ended. Reopen day if it was closed by mistake.";
  }

  return "";
}
