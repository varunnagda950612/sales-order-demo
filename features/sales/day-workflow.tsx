"use client";

import { useState } from "react";
import { Clock3, Coffee, LogOut, Play, RotateCcw } from "lucide-react";
import { formatDateForDisplay, getIndiaDate } from "@/lib/dates/india";
import {
  getRouteWorkBlockMessage,
  runSalesDayAction,
  tryCaptureSalesDayPosition,
  type SalesDayAction,
} from "@/lib/sales-day/client";
import type { SalesDaySession } from "@/types/domain";

type SalesDayWorkflowProps = {
  salesPersonId: string;
  localMode: boolean;
  writesEnabled: boolean;
  initialSession?: SalesDaySession | null;
  onSessionChange: (session: SalesDaySession | null) => void;
};

const statusLabels = {
  active: "Day active",
  on_break: "Lunch break",
  ended: "Day ended",
} as const;

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(value))
    .toLowerCase();
}

function getDurationLabel(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return "-";
  }

  const minutes = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!hours) {
    return `${remainingMinutes} min`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

function getStatusClass(session: SalesDaySession | null) {
  if (!session) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (session.status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (session.status === "on_break") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }

  return "border-stone-200 bg-stone-50 text-stone-700";
}

export function SalesDayWorkflow({
  salesPersonId,
  localMode,
  writesEnabled,
  initialSession,
  onSessionChange,
}: SalesDayWorkflowProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<SalesDayAction | null>(null);
  const session = initialSession || null;
  const workDate = getIndiaDate();
  const routeBlockMessage = getRouteWorkBlockMessage(session);

  async function handleAction(action: SalesDayAction) {
    if (!writesEnabled && !localMode) {
      setMessage("Live write protection is active. Day status cannot be changed.");
      return;
    }

    if (
      action === "end_day" &&
      !window.confirm("End day for today? Route actions will be closed after this.")
    ) {
      return;
    }

    setActiveAction(action);
    setMessage(null);

    try {
      const gpsResult =
        action === "reopen_day"
          ? { position: null, warning: null }
          : await tryCaptureSalesDayPosition();
      const nextSession = await runSalesDayAction({
        action,
        salesPersonId,
        workDate,
        localMode,
        position: gpsResult.position,
      });
      const successMessage =
        action === "start_day"
          ? "Day started. Route actions are now available."
          : action === "start_lunch"
            ? "Lunch break started. Route actions are paused."
            : action === "resume_day"
              ? "Day resumed. Route actions are available again."
              : action === "reopen_day"
                ? "Day reopened. Route actions are available again."
                : "Day ended. Route actions are closed for today.";

      onSessionChange(nextSession);
      setMessage(
        gpsResult.warning ? `${successMessage} ${gpsResult.warning}` : successMessage,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update day status.");
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className={`rounded-lg border p-4 shadow-sm ${getStatusClass(session)}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-base font-bold">
              {session ? statusLabels[session.status] : "Start day required"}
            </h2>
            <span className="rounded-full border border-current/20 bg-white/60 px-2 py-1 text-xs font-bold">
              {formatDateForDisplay(workDate)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6">
            {session?.status === "active"
              ? "Route orders, No Order visits, and route collections are open."
              : routeBlockMessage}
          </p>
          {message ? (
            <p className="mt-2 text-sm font-semibold" role="status">
              {message}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:min-w-96">
          <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-stone-500">Start</p>
            <p className="mt-1 font-bold text-stone-900">
              {formatTime(session?.startedAt)}
            </p>
          </div>
          <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-stone-500">Lunch</p>
            <p className="mt-1 font-bold text-stone-900">
              {formatTime(session?.lunchStartedAt)}
            </p>
          </div>
          <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-stone-500">Resume</p>
            <p className="mt-1 font-bold text-stone-900">
              {formatTime(session?.lunchEndedAt)}
            </p>
          </div>
          <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-stone-500">End</p>
            <p className="mt-1 font-bold text-stone-900">
              {formatTime(session?.endedAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!session ? (
          <button
            type="button"
            disabled={Boolean(activeAction)}
            onClick={() => void handleAction("start_day")}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {activeAction === "start_day" ? "Starting" : "Start Day"}
          </button>
        ) : null}

        {session?.status === "active" ? (
          <>
            <button
              type="button"
              disabled={Boolean(activeAction)}
              onClick={() => void handleAction("start_lunch")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-bold text-sky-800 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              <Coffee className="h-4 w-4" aria-hidden="true" />
              {activeAction === "start_lunch" ? "Starting" : "Lunch Break"}
            </button>
            <button
              type="button"
              disabled={Boolean(activeAction)}
              onClick={() => void handleAction("end_day")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {activeAction === "end_day" ? "Ending" : "End Day"}
            </button>
          </>
        ) : null}

        {session?.status === "on_break" ? (
          <button
            type="button"
            disabled={Boolean(activeAction)}
            onClick={() => void handleAction("resume_day")}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {activeAction === "resume_day" ? "Resuming" : "Resume Day"}
          </button>
        ) : null}

        {session?.status === "ended" ? (
          <button
            type="button"
            disabled={Boolean(activeAction)}
            onClick={() => void handleAction("reopen_day")}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {activeAction === "reopen_day" ? "Reopening" : "Reopen Day"}
          </button>
        ) : null}

        {session ? (
          <span className="inline-flex items-center rounded-lg border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-stone-700">
            Work time: {getDurationLabel(session.startedAt, session.endedAt || new Date().toISOString())}
          </span>
        ) : null}
      </div>
    </section>
  );
}
