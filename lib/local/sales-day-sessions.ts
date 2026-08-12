import {
  setLocalStorageJsonWithMaintenance,
} from "@/lib/browser/storage-maintenance";
import { getIndiaDate } from "@/lib/dates/india";
import type { SalesDaySession } from "@/types/domain";

export const localSalesDaySessionsStorageKey =
  "manish-masala-next.sales-day-sessions.v1";

export type SalesDayPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `sales-day-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readLocalSalesDaySessions(_revision = 0) {
  void _revision;

  if (!canUseBrowserStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(localSalesDaySessionsStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as SalesDaySession[]) : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions: SalesDaySession[]) {
  setLocalStorageJsonWithMaintenance(localSalesDaySessionsStorageKey, sessions);
}

export function readLocalSalesDaySessionForDate(
  salesPersonId: string,
  workDate = getIndiaDate(),
) {
  return (
    readLocalSalesDaySessions().find(
      (session) =>
        session.salesPersonId === salesPersonId &&
        session.workDate === workDate,
    ) || null
  );
}

function upsertLocalSalesDaySession(session: SalesDaySession) {
  const sessions = readLocalSalesDaySessions().filter((item) => item.id !== session.id);
  writeSessions([...sessions, session]);
  return session;
}

function getLat(position: SalesDayPosition | null | undefined) {
  return position?.latitude ?? null;
}

function getLng(position: SalesDayPosition | null | undefined) {
  return position?.longitude ?? null;
}

function getAccuracy(position: SalesDayPosition | null | undefined) {
  return position?.accuracy ?? null;
}

export function startLocalSalesDay(
  salesPersonId: string,
  workDate = getIndiaDate(),
  position?: SalesDayPosition | null,
) {
  const existingSession = readLocalSalesDaySessionForDate(salesPersonId, workDate);

  if (existingSession) {
    if (existingSession.status === "ended") {
      throw new Error("This work day is already ended.");
    }

    return existingSession;
  }

  const now = new Date().toISOString();
  return upsertLocalSalesDaySession({
    id: createId(),
    salesPersonId,
    workDate,
    status: "active",
    startedAt: now,
    startLat: getLat(position),
    startLng: getLng(position),
    startAccuracy: getAccuracy(position),
    lunchStartedAt: null,
    lunchStartLat: null,
    lunchStartLng: null,
    lunchStartAccuracy: null,
    lunchEndedAt: null,
    lunchEndLat: null,
    lunchEndLng: null,
    lunchEndAccuracy: null,
    endedAt: null,
    endLat: null,
    endLng: null,
    endAccuracy: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function startLocalLunchBreak(
  salesPersonId: string,
  workDate = getIndiaDate(),
  position?: SalesDayPosition | null,
) {
  const existingSession = readLocalSalesDaySessionForDate(salesPersonId, workDate);

  if (!existingSession) {
    throw new Error("Start day before taking lunch break.");
  }

  if (existingSession.status === "ended") {
    throw new Error("This work day is already ended.");
  }

  if (existingSession.status === "on_break") {
    return existingSession;
  }

  return upsertLocalSalesDaySession({
    ...existingSession,
    status: "on_break",
    lunchStartedAt: existingSession.lunchStartedAt || new Date().toISOString(),
    lunchStartLat: existingSession.lunchStartLat ?? getLat(position),
    lunchStartLng: existingSession.lunchStartLng ?? getLng(position),
    lunchStartAccuracy: existingSession.lunchStartAccuracy ?? getAccuracy(position),
    lunchEndedAt: null,
    lunchEndLat: null,
    lunchEndLng: null,
    lunchEndAccuracy: null,
    updatedAt: new Date().toISOString(),
  });
}

export function resumeLocalSalesDay(
  salesPersonId: string,
  workDate = getIndiaDate(),
  position?: SalesDayPosition | null,
) {
  const existingSession = readLocalSalesDaySessionForDate(salesPersonId, workDate);

  if (!existingSession) {
    throw new Error("Start day before resuming work.");
  }

  if (existingSession.status === "ended") {
    throw new Error("This work day is already ended.");
  }

  if (existingSession.status === "active") {
    return existingSession;
  }

  return upsertLocalSalesDaySession({
    ...existingSession,
    status: "active",
    lunchEndedAt: new Date().toISOString(),
    lunchEndLat: getLat(position),
    lunchEndLng: getLng(position),
    lunchEndAccuracy: getAccuracy(position),
    updatedAt: new Date().toISOString(),
  });
}

export function reopenLocalSalesDay(
  salesPersonId: string,
  workDate = getIndiaDate(),
) {
  const existingSession = readLocalSalesDaySessionForDate(salesPersonId, workDate);

  if (!existingSession) {
    throw new Error("Start day before reopening work.");
  }

  if (workDate !== getIndiaDate()) {
    throw new Error("Only today's ended day can be reopened.");
  }

  if (existingSession.status !== "ended") {
    return existingSession;
  }

  const now = new Date().toISOString();
  return upsertLocalSalesDaySession({
    ...existingSession,
    status: "active",
    endedAt: null,
    endLat: null,
    endLng: null,
    endAccuracy: null,
    lunchEndedAt:
      existingSession.lunchStartedAt && !existingSession.lunchEndedAt
        ? now
        : existingSession.lunchEndedAt,
    updatedAt: now,
  });
}

export function endLocalSalesDay(
  salesPersonId: string,
  workDate = getIndiaDate(),
  position?: SalesDayPosition | null,
) {
  const existingSession = readLocalSalesDaySessionForDate(salesPersonId, workDate);

  if (!existingSession) {
    throw new Error("Start day before ending work.");
  }

  if (existingSession.status === "ended") {
    return existingSession;
  }

  const now = new Date().toISOString();
  return upsertLocalSalesDaySession({
    ...existingSession,
    status: "ended",
    endedAt: now,
    endLat: getLat(position),
    endLng: getLng(position),
    endAccuracy: getAccuracy(position),
    lunchEndedAt:
      existingSession.status === "on_break" && !existingSession.lunchEndedAt
        ? now
        : existingSession.lunchEndedAt,
    lunchEndLat:
      existingSession.status === "on_break" && !existingSession.lunchEndedAt
        ? getLat(position)
        : existingSession.lunchEndLat,
    lunchEndLng:
      existingSession.status === "on_break" && !existingSession.lunchEndedAt
        ? getLng(position)
        : existingSession.lunchEndLng,
    lunchEndAccuracy:
      existingSession.status === "on_break" && !existingSession.lunchEndedAt
        ? getAccuracy(position)
        : existingSession.lunchEndAccuracy,
    updatedAt: now,
  });
}
