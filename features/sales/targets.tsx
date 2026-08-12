"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { formatDateForDisplay, getIndiaDate } from "@/lib/dates/india";
import { readLocalOrders } from "@/lib/local/orders";
import { readLocalSalesTargets } from "@/lib/local/targets";
import { getUnsyncedOrders } from "@/lib/sync/core-outbox";
import {
  formatTargetKg,
  getProgressMessage,
  getTargetPeriod,
  getTargetProgress,
  type TargetPeriod,
  type TargetProgress,
} from "@/lib/targets/progress";
import type { LocalOrder, LocalSalesTarget } from "@/types/domain";

type SalesTargetsProps = {
  salesPersonId: string;
  refreshKey: number;
  initialTargets?: LocalSalesTarget[];
  initialOrders?: LocalOrder[];
};

function mergeOrdersForTargets(initialOrders: LocalOrder[] | undefined, localOrders: LocalOrder[]) {
  const orderById = new Map<string, LocalOrder>();

  (initialOrders || localOrders).forEach((order) => {
    orderById.set(order.id, order);
  });

  getUnsyncedOrders().forEach((order) => {
    orderById.set(order.id, order);
  });

  return Array.from(orderById.values());
}

function ProgressSegments({ percent }: { percent: number }) {
  const activeSegments = Math.ceil(percent / 10);

  return (
    <div
      className="mt-4 grid grid-cols-10 gap-1"
      aria-label={`${percent}% complete`}
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <span
          key={index}
          className={`h-2 rounded-full ${
            index < activeSegments ? "bg-emerald-600" : "bg-stone-100"
          }`}
        />
      ))}
    </div>
  );
}

function TargetProgressCard({ item }: { item: TargetProgress }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-stone-900">
            {item.target.productName}
          </h3>
          <p className="mt-1 text-sm font-medium text-stone-600">
            {item.target.skuSize}
            {item.target.skuCode ? ` - ${item.target.skuCode}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">
          {item.progressPercent}%
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-stone-600">
        <CalendarDays
          className="h-4 w-4 shrink-0 text-stone-400"
          aria-hidden="true"
        />
        <span>
          {formatDateForDisplay(item.target.startDate)} to{" "}
          {formatDateForDisplay(item.target.endDate)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Target
          </p>
          <p className="mt-1 font-bold text-stone-900">
            {formatTargetKg(item.target.targetKg)}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Completed
          </p>
          <p className="mt-1 font-bold text-emerald-800">
            {formatTargetKg(item.completedKg)}
          </p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase text-orange-700">
            Pending
          </p>
          <p className="mt-1 font-bold text-orange-800">
            {formatTargetKg(item.pendingKg)}
          </p>
        </div>
      </div>

      <ProgressSegments percent={item.progressPercent} />
      <p className="mt-3 text-sm font-semibold text-stone-700">
        {getProgressMessage(item.completedKg, item.target.targetKg)}
      </p>
    </article>
  );
}

function TargetGroup({
  period,
  rows,
  isOpen,
  onToggle,
}: {
  period: TargetPeriod;
  rows: TargetProgress[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const labels: Record<TargetPeriod, string> = {
    active: "Active Targets",
    upcoming: "Upcoming Targets",
    previous: "Previous Targets",
  };

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-50"
      >
        <span className="flex items-center gap-2 text-lg font-bold text-stone-900">
          <ChevronRight
            className={`h-5 w-5 transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
            aria-hidden="true"
          />
          {labels[period]} ({rows.length})
        </span>
      </button>
      {isOpen ? (
        rows.length ? (
          <div className="grid gap-3 border-t border-stone-200 p-4 lg:grid-cols-2">
            {rows.map((item) => (
              <TargetProgressCard key={item.target.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="border-t border-stone-200 px-4 py-5 text-sm text-stone-600">
            No {period === "active" ? "active" : period} targets are assigned.
          </p>
        )
      ) : null}
    </section>
  );
}

export function SalesTargets({
  salesPersonId,
  refreshKey,
  initialTargets,
  initialOrders,
}: SalesTargetsProps) {
  const [openPeriod, setOpenPeriod] = useState<TargetPeriod | null>("active");
  const today = getIndiaDate();
  const targets = useMemo(
    () =>
      (initialTargets || readLocalSalesTargets(refreshKey))
        .filter((target) => target.salesPersonId === salesPersonId)
        .sort(
          (a, b) =>
            a.endDate.localeCompare(b.endDate) ||
            a.productName.localeCompare(b.productName),
        ),
    [initialTargets, refreshKey, salesPersonId],
  );
  const orders = useMemo(
    () =>
      mergeOrdersForTargets(
        initialOrders,
        initialOrders ? [] : readLocalOrders(refreshKey),
      ).filter(
        (order) =>
          order.salesPersonId === salesPersonId && order.status !== "cancelled",
      ),
    [initialOrders, refreshKey, salesPersonId],
  );
  const targetProgress = useMemo(
    () => targets.map((target) => getTargetProgress(target, orders)),
    [orders, targets],
  );
  const targetsByPeriod = useMemo(
    () =>
      targetProgress.reduce<Record<TargetPeriod, TargetProgress[]>>(
        (groups, item) => {
          groups[getTargetPeriod(item.target, today)].push(item);
          return groups;
        },
        { active: [], upcoming: [], previous: [] },
      ),
    [targetProgress, today],
  );
  const summary = targetsByPeriod.active.reduce(
    (total, item) => ({
      targetKg: total.targetKg + item.target.targetKg,
      completedKg: total.completedKg + item.cappedCompletedKg,
      pendingKg: total.pendingKg + item.pendingKg,
    }),
    { targetKg: 0, completedKg: 0, pendingKg: 0 },
  );
  const completionPercent =
    summary.targetKg > 0
      ? Math.round((summary.completedKg / summary.targetKg) * 100)
      : 0;

  return (
    <section id="targets" className="space-y-4" aria-labelledby="targets-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">
              {initialTargets ? "Live SKU-wise progress" : "SKU-wise progress"}
            </p>
            <h2
              id="targets-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              Targets
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Target progress is calculated from route and adhoc order
              quantities using SKU grams.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">
                Total target
              </p>
              <p className="mt-1 text-xl font-bold text-stone-900">
                {summary.targetKg.toFixed(1)} kg
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Completed
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-800">
                {summary.completedKg.toFixed(1)} kg
              </p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-orange-700">
                Pending
              </p>
              <p className="mt-1 text-xl font-bold text-orange-800">
                {summary.pendingKg.toFixed(1)} kg
              </p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-sky-700">
                Completion
              </p>
              <p className="mt-1 text-xl font-bold text-sky-800">
                {completionPercent}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {(["active", "upcoming", "previous"] as const).map((period) => (
        <TargetGroup
          key={period}
          period={period}
          rows={targetsByPeriod[period]}
          isOpen={openPeriod === period}
          onToggle={() =>
            setOpenPeriod((current) => (current === period ? null : period))
          }
        />
      ))}
    </section>
  );
}
