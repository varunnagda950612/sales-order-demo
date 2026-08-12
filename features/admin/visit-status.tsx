"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import {
  formatDateForDisplay,
  getIndiaDate,
  getIndiaWeekday,
  getUtcRangeForIndiaDateRange,
  getWholeDayDifference,
} from "@/lib/dates/india";
import { readLocalOrders } from "@/lib/local/orders";
import { readLocalShops } from "@/lib/local/shops";
import { readLocalUsers } from "@/lib/local/users";
import { readLocalVisitRecords, type LocalVisitRecord } from "@/lib/local/visit-proofs";
import { getUnsyncedOrders, getUnsyncedVisitProofs } from "@/lib/sync/core-outbox";
import { getSkuGrams } from "@/lib/orders/weights";
import { buildUserNameMap, getSalespersonName } from "@/lib/users/display";
import {
  mergeUniqueShops,
  readSupabaseOrdersWithShops,
  readSupabaseVisitProofsWithShops,
} from "@/lib/repositories/supabase-read";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  AreaRouteSchedule,
  LocalOrder,
  RouteOverride,
  SalesRouteShop,
  UserProfile,
} from "@/types/domain";

type VisitStatusRow = {
  date: string;
  shop: SalesRouteShop;
  salesPersonId: string;
  status: "pending" | "order" | "no_order";
  order: LocalOrder | null;
};

type VisitSummary = {
  routeShops: number;
  checkedIn: number;
  pending: number;
  productive: number;
  unproductive: number;
  totalKg: number;
};

function areaKey(area: string) {
  return (area || "Unassigned").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeVisitDay(value: string | null | undefined) {
  const compactValue = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
  const aliases: Record<string, string> = {
    sun: "sunday",
    sunday: "sunday",
    mon: "monday",
    monday: "monday",
    tue: "tuesday",
    tues: "tuesday",
    tuesday: "tuesday",
    wed: "wednesday",
    wednesday: "wednesday",
    thu: "thursday",
    thur: "thursday",
    thurs: "thursday",
    thursday: "thursday",
    fri: "friday",
    friday: "friday",
    sat: "saturday",
    saturday: "saturday",
    asrequired: "as_required",
  };

  return aliases[compactValue] || compactValue;
}

function getDateRange(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo) {
    return [];
  }

  const startDate = dateFrom <= dateTo ? dateFrom : dateTo;
  const endDate = dateFrom <= dateTo ? dateTo : dateFrom;
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00.000Z`);

  while (cursor.toISOString().slice(0, 10) <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function isScheduleDue(
  schedule: AreaRouteSchedule,
  date: string,
  weekday: string,
) {
  if (normalizeVisitDay(schedule.visitDay) !== weekday) {
    return false;
  }

  if (schedule.frequency === "weekly") {
    return true;
  }

  const daysSinceStart = getWholeDayDifference(schedule.startDate, date);
  return daysSinceStart >= 0 && Math.floor(daysSinceStart / 7) % 2 === 0;
}

function getOverrideAreas(
  overrides: RouteOverride[],
  salesPersonId: string,
  date: string,
) {
  const areasByKey = new Map<string, string>();

  overrides.forEach((override) => {
    if (
      override.salesPersonId === salesPersonId &&
      override.overrideDate === date
    ) {
      areasByKey.set(areaKey(override.area), override.area);
    }
  });

  return Array.from(areasByKey.values());
}

function shopMatchesRouteDate(
  shop: SalesRouteShop,
  date: string,
  schedules: AreaRouteSchedule[],
) {
  const weekday = getIndiaWeekday(new Date(`${date}T12:00:00.000Z`));
  const matchingSchedules = schedules.filter(
    (schedule) =>
      areaKey(schedule.area) === areaKey(shop.area) &&
      (!schedule.salesPersonId || schedule.salesPersonId === shop.assignedTo),
  );
  const schedule =
    matchingSchedules.find((item) => item.salesPersonId === shop.assignedTo) ||
    matchingSchedules.find((item) => !item.salesPersonId) ||
    null;

  if (schedule) {
    return isScheduleDue(schedule, date, weekday);
  }

  const visitDay = normalizeVisitDay(shop.visitDay);
  return !visitDay || visitDay === "as_required" || visitDay === weekday;
}

function getRouteRowKey(date: string, shopId: string) {
  return `${date}:${shopId}`;
}

function buildExpectedRouteRows(
  shops: SalesRouteShop[],
  date: string,
  schedules: AreaRouteSchedule[],
  overrides: RouteOverride[],
  selectedSalesperson: string,
) {
  const routeOwnerIds = Array.from(
    new Set([
      ...shops
        .map((shop) => shop.assignedTo)
        .filter((salesPersonId): salesPersonId is string =>
          Boolean(salesPersonId),
        ),
      ...overrides
        .filter((override) => override.overrideDate === date)
        .map((override) => override.salesPersonId),
    ]),
  );
  const ownerIds =
    selectedSalesperson === "all" ? routeOwnerIds : [selectedSalesperson];
  const expectedRows = new Map<
    string,
    Omit<VisitStatusRow, "status" | "order">
  >();

  ownerIds.forEach((salesPersonId) => {
    const overrideAreas = getOverrideAreas(overrides, salesPersonId, date);
    const ownerShops = overrideAreas.length
      ? shops.filter((shop) =>
          overrideAreas.some((area) => areaKey(area) === areaKey(shop.area)),
        )
      : shops
          .filter((shop) => shop.assignedTo === salesPersonId)
          .filter((shop) => shopMatchesRouteDate(shop, date, schedules));

    ownerShops.forEach((shop) => {
      const key = getRouteRowKey(date, shop.id);
      if (!expectedRows.has(key)) {
        expectedRows.set(key, { date, shop, salesPersonId });
      }
    });
  });

  return Array.from(expectedRows.values());
}

function buildVisitRows(
  shops: SalesRouteShop[],
  orders: LocalOrder[],
  visits: LocalVisitRecord[],
  dates: string[],
  schedules: AreaRouteSchedule[],
  overrides: RouteOverride[],
  selectedSalesperson: string,
) {
  const routeOrdersByRoute = new Map<string, LocalOrder>();
  const noOrderRouteKeys = new Set<string>();

  orders
    .filter(
      (order) => order.orderType === "route" && order.status !== "cancelled",
    )
    .filter(
      (order) =>
        selectedSalesperson === "all" ||
        order.salesPersonId === selectedSalesperson,
    )
    .forEach((order) => {
      const date = getIndiaDate(new Date(order.createdAt));
      const key = getRouteRowKey(date, order.shopId);
      const current = routeOrdersByRoute.get(key);

      if (!current || new Date(order.createdAt) > new Date(current.createdAt)) {
        routeOrdersByRoute.set(key, order);
      }
    });

  visits.forEach((visit) => {
    if (
      (selectedSalesperson !== "all" &&
        visit.salesPersonId !== selectedSalesperson) ||
      visit.visitType !== "no_order"
    ) {
      return;
    }

    const date = getIndiaDate(new Date(visit.capturedAt));
    noOrderRouteKeys.add(getRouteRowKey(date, visit.shopId));
  });

  return dates.flatMap((date) =>
    buildExpectedRouteRows(
      shops,
      date,
      schedules,
      overrides,
      selectedSalesperson,
    ).map((expectedRow): VisitStatusRow => {
      const key = getRouteRowKey(date, expectedRow.shop.id);
      const order = routeOrdersByRoute.get(key) || null;

      return {
        ...expectedRow,
        status: order
          ? "order"
          : noOrderRouteKeys.has(key)
            ? "no_order"
            : "pending",
        order,
      };
    }),
  );
}

function getSummary(rows: VisitStatusRow[]): VisitSummary {
  const productiveRows = rows.filter((row) => row.status === "order");
  const unproductiveRows = rows.filter((row) => row.status === "no_order");
  const totalKg = productiveRows.reduce(
    (total, row) =>
      total +
      (row.order?.items.reduce(
        (orderTotal, item) =>
          orderTotal + (getSkuGrams(item.skuSize) * item.quantity) / 1000,
        0,
      ) || 0),
    0,
  );

  return {
    routeShops: rows.length,
    checkedIn: productiveRows.length + unproductiveRows.length,
    pending: rows.filter((row) => row.status === "pending").length,
    productive: productiveRows.length,
    unproductive: unproductiveRows.length,
    totalKg,
  };
}

function formatKg(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function filterRows(
  rows: VisitStatusRow[],
  selectedSalesperson: string,
  selectedArea: string,
) {
  return rows.filter(
    (row) =>
      (selectedSalesperson === "all" ||
        row.salesPersonId === selectedSalesperson) &&
      (selectedArea === "all" || row.shop.area === selectedArea),
  );
}

function EmptyTableRow({ columns, label }: { columns: number; label: string }) {
  return (
    <tr>
      <td
        colSpan={columns}
        className="px-3 py-6 text-center text-sm text-slate-500"
      >
        {label}
      </td>
    </tr>
  );
}

export function AdminVisitStatus({
  initialShops,
  initialOrders,
  initialVisits,
  initialUsers,
  initialRouteSchedules = [],
  initialRouteOverrides = [],
}: {
  initialShops?: SalesRouteShop[];
  initialOrders?: LocalOrder[];
  initialVisits?: LocalVisitRecord[];
  initialUsers?: UserProfile[];
  initialRouteSchedules?: AreaRouteSchedule[];
  initialRouteOverrides?: RouteOverride[];
}) {
  const [refreshKey] = useState(0);
  const today = getIndiaDate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedSalesperson, setSelectedSalesperson] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [liveOrders, setLiveOrders] = useState<LocalOrder[] | null>(
    () => initialOrders || null,
  );
  const [liveVisits, setLiveVisits] = useState<LocalVisitRecord[] | null>(
    () => initialVisits || null,
  );
  const [liveShops, setLiveShops] = useState<SalesRouteShop[]>([]);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [rangeMessage, setRangeMessage] = useState("");
  const didSkipInitialRangeReadRef = useRef(false);
  const shops = useMemo(
    () => mergeUniqueShops(initialShops || readLocalShops(refreshKey), liveShops),
    [initialShops, liveShops, refreshKey],
  );
  const liveOrderSource = liveOrders ?? initialOrders;
  const liveVisitSource = liveVisits ?? initialVisits;
  const orders = useMemo(() => {
    const orderById = new Map<string, LocalOrder>();

    (liveOrderSource || readLocalOrders(refreshKey)).forEach((order) => {
      orderById.set(order.id, order);
    });
    getUnsyncedOrders().forEach((order) => {
      orderById.set(order.id, order);
    });

    return Array.from(orderById.values());
  }, [liveOrderSource, refreshKey]);
  const visits = useMemo(() => {
    const visitById = new Map<string, LocalVisitRecord>();

    (liveVisitSource || readLocalVisitRecords(refreshKey)).forEach((visit) => {
      visitById.set(visit.id, visit);
    });
    getUnsyncedVisitProofs().forEach((visit) => {
      visitById.set(visit.id, visit);
    });

    return Array.from(visitById.values());
  }, [liveVisitSource, refreshKey]);
  const users = initialUsers || readLocalUsers(refreshKey);
  const userNameById = useMemo(() => buildUserNameMap(users), [users]);
  const rangeDates = useMemo(
    () => getDateRange(dateFrom, dateTo),
    [dateFrom, dateTo],
  );
  const salespersonOptions = useMemo(
    () =>
      users
        .filter((user) => user.role === "sales" && user.active)
        .map((user) => user.id)
        .sort((a, b) =>
          getSalespersonName(userNameById, a).localeCompare(
            getSalespersonName(userNameById, b),
          ),
        ),
    [userNameById, users],
  );
  const activeSalesperson = salespersonOptions.includes(selectedSalesperson)
    ? selectedSalesperson
    : "all";
  const rangeRows = useMemo(
    () =>
      buildVisitRows(
        shops,
        orders,
        visits,
        rangeDates,
        initialRouteSchedules,
        initialRouteOverrides,
        activeSalesperson,
      ),
    [
      activeSalesperson,
      initialRouteOverrides,
      initialRouteSchedules,
      orders,
      rangeDates,
      shops,
      visits,
    ],
  );
  const areaOptions = useMemo(
    () => Array.from(new Set(rangeRows.map((row) => row.shop.area))).sort(),
    [rangeRows],
  );

  const activeArea = areaOptions.includes(selectedArea) ? selectedArea : "all";

  const visibleRangeRows = useMemo(
    () => filterRows(rangeRows, activeSalesperson, activeArea),
    [activeArea, activeSalesperson, rangeRows],
  );
  const rangeSummary = useMemo(
    () => getSummary(visibleRangeRows),
    [visibleRangeRows],
  );
  const summaryPeriodLabel =
    dateFrom === dateTo
      ? dateFrom === today
        ? "Today"
        : formatDateForDisplay(dateFrom)
      : "Selected range";
  const pendingRows = useMemo(
    () =>
      visibleRangeRows
        .filter((row) => row.status === "pending")
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.shop.area.localeCompare(b.shop.area) ||
            a.shop.name.localeCompare(b.shop.name),
        ),
    [visibleRangeRows],
  );
  const checkedInRows = useMemo(
    () =>
      visibleRangeRows
        .filter((row) => row.status === "order" || row.status === "no_order")
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.shop.area.localeCompare(b.shop.area) ||
            a.shop.name.localeCompare(b.shop.name),
        ),
    [visibleRangeRows],
  );

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    if (value > dateTo) {
      setDateTo(value);
    }
  }

  useEffect(() => {
    if (!initialOrders || !initialVisits) {
      return;
    }

    if (!didSkipInitialRangeReadRef.current) {
      didSkipInitialRangeReadRef.current = true;
      return;
    }

    const range = getUtcRangeForIndiaDateRange(dateFrom, dateTo);

    if (!range.start && !range.end) {
      const timeoutId = window.setTimeout(() => {
        setLiveOrders([]);
        setLiveVisits([]);
        setLiveShops([]);
        setRangeMessage("Select a date range to load visit status.");
      });

      return () => window.clearTimeout(timeoutId);
    }

    let isActive = true;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingRange(true);
      setRangeMessage("");
      const supabase = createSupabaseBrowserClient();
      const salesPersonId =
        selectedSalesperson === "all" ? undefined : selectedSalesperson;

      Promise.all([
        readSupabaseOrdersWithShops(supabase, {
          salesPersonId,
          createdAtFrom: range.start,
          createdAtTo: range.end,
        }),
        readSupabaseVisitProofsWithShops(supabase, {
          salesPersonId,
          capturedAtFrom: range.start,
          capturedAtTo: range.end,
        }),
      ])
        .then(([ordersRead, visitsRead]) => {
          if (!isActive) {
            return;
          }

          setLiveOrders(ordersRead.orders);
          setLiveVisits(visitsRead.visits);
          setLiveShops(mergeUniqueShops(ordersRead.shops, visitsRead.shops));
          setRangeMessage("");
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          setRangeMessage(
            error instanceof Error ? error.message : "Unable to load visit status.",
          );
        })
        .finally(() => {
          if (isActive) {
            setIsLoadingRange(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [dateFrom, dateTo, initialOrders, initialVisits, selectedSalesperson]);

  return (
    <section
      id="visit-status"
      className="min-w-0 space-y-4 scroll-mt-32"
      aria-labelledby="visit-status-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-orange-700">Route completion</p>
        <h2
          id="visit-status-title"
          className="mt-1 text-2xl font-bold text-stone-900"
        >
          Visit Status
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Review expected route shops, completed visits, and pending visits.
        </p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-4 items-end">
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">
              Salesperson
            </span>
            <select
              value={activeSalesperson}
              onChange={(event) => setSelectedSalesperson(event.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All salespeople</option>
              {salespersonOptions.map((salesPersonId) => (
                <option key={salesPersonId} value={salesPersonId}>
                  {getSalespersonName(userNameById, salesPersonId)}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">
              From Date
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => handleDateFromChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">
              To Date
            </span>
            <input
              type="date"
              min={dateFrom}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>

          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">Area</span>
            <select
              value={activeArea}
              onChange={(event) => setSelectedArea(event.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All areas</option>
              {areaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
        </div>
        {isLoadingRange || rangeMessage ? (
          <p className="mt-3 text-sm font-semibold text-stone-600">
            {isLoadingRange ? "Loading selected visit range..." : rangeMessage}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Route shops
          </p>
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {rangeSummary.routeShops}
          </p>
          <p className="mt-1 text-xs text-stone-500">{summaryPeriodLabel}</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-sky-700">
            Checked in
          </p>
          <p className="mt-1 text-2xl font-bold text-sky-800">
            {rangeSummary.checkedIn}
          </p>
          <p className="mt-1 text-xs text-sky-700">{summaryPeriodLabel}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-amber-700">
            Pending
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-800">
            {rangeSummary.pending}
          </p>
          <p className="mt-1 text-xs text-amber-700">{summaryPeriodLabel}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Productive visit
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {rangeSummary.productive}
          </p>
          <p className="mt-1 text-xs text-emerald-700">{summaryPeriodLabel}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-orange-700">
            Unproductive visit
          </p>
          <p className="mt-1 text-2xl font-bold text-orange-800">
            {rangeSummary.unproductive}
          </p>
          <p className="mt-1 text-xs text-orange-700">{summaryPeriodLabel}</p>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-violet-700">
            Total KG ordered
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-800">
            {formatKg(rangeSummary.totalKg)} kg
          </p>
          <p className="mt-1 text-xs text-violet-700">{summaryPeriodLabel}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section
          className="min-w-0 overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm"
          aria-labelledby="pending-shops-title"
        >
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-3 sm:px-4">
            <h3
              id="pending-shops-title"
              className="text-lg font-bold text-stone-900"
            >
              Pending Shops
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {pendingRows.length} shops not operationally completed
            </p>
          </div>
          <div className="h-80 overflow-auto sm:h-96">
            <table className="min-w-max text-left text-sm">
              <thead className="sticky top-0 z-10 bg-stone-100 text-stone-700">
                <tr>
                  <th className="min-w-28 px-3 py-3 font-bold">Date</th>
                  <th className="min-w-56 px-3 py-3 font-bold">Shop name</th>
                  <th className="min-w-36 px-3 py-3 font-bold">Area</th>
                  <th className="min-w-44 px-3 py-3 font-bold">Salesperson</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.length ? (
                  pendingRows.map((row) => (
                    <tr
                      key={`${row.date}-${row.shop.id}-${row.salesPersonId}`}
                      className="border-t border-stone-200 transition-colors hover:bg-stone-50"
                    >
                      <td className="px-3 py-3 font-medium text-stone-700">
                        {formatDateForDisplay(row.date)}
                      </td>
                      <td className="px-3 py-3 font-bold text-stone-900">
                        {row.shop.name}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {row.shop.area}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {getSalespersonName(userNameById, row.salesPersonId)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow
                    columns={4}
                    label="No pending shops in this range."
                  />
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="min-w-0 overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm"
          aria-labelledby="checked-in-shops-title"
        >
          <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-3 sm:px-4">
            <h3
              id="checked-in-shops-title"
              className="text-lg font-bold text-stone-900"
            >
              Checked In Shops
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {checkedInRows.length} shops completed with an order outcome
            </p>
          </div>
          <div className="h-80 overflow-auto sm:h-96">
            <table className="min-w-max text-left text-sm">
              <thead className="sticky top-0 z-10 bg-stone-100 text-stone-700">
                <tr>
                  <th className="min-w-28 px-3 py-3 font-bold">Date</th>
                  <th className="min-w-56 px-3 py-3 font-bold">Shop name</th>
                  <th className="min-w-36 px-3 py-3 font-bold">Area</th>
                  <th className="min-w-44 px-3 py-3 font-bold">Salesperson</th>
                  <th className="min-w-28 px-3 py-3 font-bold">Order status</th>
                </tr>
              </thead>
              <tbody>
                {checkedInRows.length ? (
                  checkedInRows.map((row) => (
                    <tr
                      key={`${row.date}-${row.shop.id}-${row.salesPersonId}`}
                      className="border-t border-stone-200 transition-colors hover:bg-stone-50"
                    >
                      <td className="px-3 py-3 font-medium text-stone-700">
                        {formatDateForDisplay(row.date)}
                      </td>
                      <td className="px-3 py-3 font-bold text-stone-900">
                        {row.shop.name}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {row.shop.area}
                      </td>
                      <td className="px-3 py-3 text-stone-700">
                        {getSalespersonName(userNameById, row.salesPersonId)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            row.status === "order"
                              ? "rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800"
                              : "rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800"
                          }
                        >
                          {row.status === "order" ? "Order" : "No order"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow
                    columns={5}
                    label="No completed visits in this range."
                  />
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {!rangeRows.length ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <FileText
            className="mx-auto h-8 w-8 text-stone-400"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-bold text-stone-900">
            No route shops
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            No route schedule, override, or fallback visit-day route is
            available for this date range.
          </p>
        </div>
      ) : null}
    </section>
  );
}
