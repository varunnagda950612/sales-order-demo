"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MapIcon, MapPin, Navigation, Route } from "lucide-react";
import {
  formatDateTimeForDisplay,
  getIndiaDate,
  getUtcRangeForIndiaDate,
} from "@/lib/dates/india";
import { readLocalShops } from "@/lib/local/shops";
import { readLocalUsers } from "@/lib/local/users";
import { readLocalVisitRecords, type LocalVisitRecord } from "@/lib/local/visit-proofs";
import { getGoogleMapsDirectionsUrl, getGoogleMapsRouteUrl } from "@/lib/maps/google";
import {
  mergeUniqueShops,
  readSupabaseVisitProofsWithShops,
} from "@/lib/repositories/supabase-read";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getUnsyncedVisitProofs } from "@/lib/sync/core-outbox";
import { buildUserNameMap, getSalespersonName } from "@/lib/users/display";
import { GpsRouteMap, type GpsRouteMapStop } from "./gps-route-map";
import type { SalesRouteShop, UserProfile } from "@/types/domain";

const visitTypeLabels = {
  check_in: "Check in",
  order_started: "Order placed",
  no_order: "No Order",
};

function getVisitPriority(visitType: LocalVisitRecord["visitType"]) {
  if (visitType === "order_started") {
    return 3;
  }

  if (visitType === "no_order") {
    return 2;
  }

  return 1;
}

function getVisitDisplayKey(visit: LocalVisitRecord) {
  return `${visit.salesPersonId}:${visit.shopId}:${getIndiaDate(new Date(visit.capturedAt))}`;
}

function chooseDisplayVisit(current: LocalVisitRecord | undefined, next: LocalVisitRecord) {
  if (!current) {
    return next;
  }

  const currentPriority = getVisitPriority(current.visitType);
  const nextPriority = getVisitPriority(next.visitType);

  if (nextPriority > currentPriority) {
    return {
      ...next,
      distanceMeters: next.distanceMeters ?? current.distanceMeters,
    };
  }

  if (nextPriority < currentPriority) {
    return {
      ...current,
      distanceMeters: current.distanceMeters ?? next.distanceMeters,
    };
  }

  const latestVisit =
    new Date(next.capturedAt).getTime() > new Date(current.capturedAt).getTime()
      ? next
      : current;
  const otherVisit = latestVisit === next ? current : next;

  return {
    ...latestVisit,
    distanceMeters: latestVisit.distanceMeters ?? otherVisit.distanceMeters,
  };
}

function getDisplayVisits(visits: LocalVisitRecord[]) {
  const visitByDisplayKey = new Map<string, LocalVisitRecord>();

  visits.forEach((visit) => {
    const key = getVisitDisplayKey(visit);
    visitByDisplayKey.set(key, chooseDisplayVisit(visitByDisplayKey.get(key), visit));
  });

  return Array.from(visitByDisplayKey.values()).sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
}

function formatDateTime(value: string) {
  return formatDateTimeForDisplay(value);
}

function getUnknownShopLabel(visit: LocalVisitRecord) {
  return visit.shopId ? `Shop ID: ${visit.shopId}` : "Shop ID missing";
}

export function AdminGpsRoute({
  initialShops,
  initialVisits,
  initialUsers,
}: {
  initialShops?: SalesRouteShop[];
  initialVisits?: LocalVisitRecord[];
  initialUsers?: UserProfile[];
}) {
  const [refreshKey] = useState(0);
  const today = getIndiaDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSalesperson, setSelectedSalesperson] = useState("");
  const [liveVisits, setLiveVisits] = useState<LocalVisitRecord[] | null>(
    () => initialVisits || null,
  );
  const [liveShops, setLiveShops] = useState<SalesRouteShop[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const shops = useMemo(
    () => mergeUniqueShops(initialShops || readLocalShops(refreshKey), liveShops),
    [initialShops, liveShops, refreshKey],
  );
  const users = initialUsers || readLocalUsers(refreshKey);
  const shopById = useMemo(
    () => new Map(shops.map((shop) => [shop.id, shop])),
    [shops],
  );
  const userNameById = useMemo(() => buildUserNameMap(users), [users]);
  const visits = useMemo(() => {
    const visitById = new Map<string, LocalVisitRecord>();

    (liveVisits || readLocalVisitRecords(refreshKey)).forEach((visit) => {
      visitById.set(visit.id, visit);
    });
    getUnsyncedVisitProofs().forEach((visit) => {
      visitById.set(visit.id, visit);
    });

    return Array.from(visitById.values());
  }, [liveVisits, refreshKey]);
  const salespersonOptions = useMemo(
    () => {
      const salespeople = users.filter((user) => user.role === "sales" && user.active);
      const ids = salespeople.length
        ? salespeople.map((user) => user.id)
        : Array.from(new Set(visits.map((visit) => visit.salesPersonId)));

      return ids.sort(
        (a, b) =>
          getSalespersonName(userNameById, a).localeCompare(
            getSalespersonName(userNameById, b),
          ),
      );
    },
    [userNameById, users, visits],
  );
  const visibleVisits = useMemo(
    () =>
      getDisplayVisits(
        visits
          .filter(() => Boolean(selectedSalesperson))
          .filter(
            (visit) => getIndiaDate(new Date(visit.capturedAt)) === selectedDate,
          )
          .filter((visit) => visit.salesPersonId === selectedSalesperson),
      ),
    [selectedDate, selectedSalesperson, visits],
  );
  const locatedVisits = visibleVisits.filter(
    (visit) => visit.latitude !== null && visit.longitude !== null,
  );
  const routeMapUrl = getGoogleMapsRouteUrl(locatedVisits);
  const mapStops = useMemo<GpsRouteMapStop[]>(
    () =>
      visibleVisits.flatMap((visit, index) => {
        const mapUrl = getGoogleMapsDirectionsUrl(visit.latitude, visit.longitude);
        const shop = shopById.get(visit.shopId);

        if (visit.latitude === null || visit.longitude === null || !mapUrl) {
          return [];
        }

        return [
          {
            id: `${visit.shopId}-${visit.salesPersonId}-${visit.visitType}-${visit.capturedAt}`,
            stopNumber: index + 1,
            shopName: shop?.name || "Unknown shop",
            area: shop?.area || getUnknownShopLabel(visit),
            capturedAt: visit.capturedAt,
            latitude: visit.latitude,
            longitude: visit.longitude,
            mapUrl,
          },
        ];
      }),
    [shopById, visibleVisits],
  );
  const selectedSalespersonName =
    !selectedSalesperson
      ? "Selected salesperson"
      : getSalespersonName(userNameById, selectedSalesperson);

  useEffect(() => {
    if (!initialVisits) {
      return;
    }

    if (!selectedSalesperson || !selectedDate) {
      const timeoutId = window.setTimeout(() => {
        setLiveVisits([]);
        setLiveShops([]);
        setRouteMessage("Select one salesperson to view their daily route.");
      });

      return () => window.clearTimeout(timeoutId);
    }

    const range = getUtcRangeForIndiaDate(selectedDate);
    let isActive = true;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingRoute(true);
      setRouteMessage("");
      const supabase = createSupabaseBrowserClient();
      readSupabaseVisitProofsWithShops(supabase, {
        salesPersonId: selectedSalesperson,
        capturedAtFrom: range.start,
        capturedAtTo: range.end,
      })
        .then((visitsRead) => {
          if (!isActive) {
            return;
          }

          setLiveVisits(visitsRead.visits);
          setLiveShops(visitsRead.shops);
          setRouteMessage("");
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          setRouteMessage(
            error instanceof Error ? error.message : "Unable to load GPS route.",
          );
        })
        .finally(() => {
          if (isActive) {
            setIsLoadingRoute(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [initialVisits, selectedDate, selectedSalesperson]);

  return (
    <section
      id="gps-route"
      className="space-y-4 scroll-mt-32"
      aria-labelledby="gps-route-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">
              Visit timeline
            </p>
            <h2
              id="gps-route-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              GPS Route
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              View verified shop check-ins and the road route between stops.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">
                Visits
              </p>
              <p className="mt-1 text-xl font-bold text-stone-900">
                {visibleVisits.length}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-emerald-700">
                GPS Points
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-800">
                {locatedVisits.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">
              Salesperson
            </span>
            <select
              value={selectedSalesperson}
              onChange={(event) => setSelectedSalesperson(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="">Select salesperson</option>
              {salespersonOptions.map((salesPersonId) => (
                <option key={salesPersonId} value={salesPersonId}>
                  {getSalespersonName(userNameById, salesPersonId)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Date</span>
            <input
              type="date"
              max={today}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
        </div>
        {isLoadingRoute || routeMessage ? (
          <p className="mt-3 text-sm font-semibold text-stone-600">
            {isLoadingRoute ? "Loading selected GPS route..." : routeMessage}
          </p>
        ) : null}
      </div>

      {!selectedSalesperson ? (
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-stone-900">GPS Timeline</h3>
          <p className="mt-1 text-sm text-stone-600">Select one salesperson to view their daily route.</p>
        </div>
      ) : visibleVisits.length ? (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-stone-900">
                {selectedSalespersonName} GPS Timeline
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                {locatedVisits.length} verified check-ins
              </p>
            </div>
            <a
              href={routeMapUrl || undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!routeMapUrl}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold ${
                routeMapUrl
                  ? "bg-stone-900 text-white hover:bg-stone-800"
                  : "pointer-events-none bg-stone-300 text-white"
              }`}
            >
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              Open route map
            </a>
          </div>
          <GpsRouteMap stops={mapStops} />
          <ol className="mt-4 space-y-3">
            {visibleVisits.map((visit, index) => {
              const shop = shopById.get(visit.shopId);
              const mapUrl =
                visit.latitude !== null && visit.longitude !== null
                  ? getGoogleMapsDirectionsUrl(visit.latitude, visit.longitude)
                  : null;

              return (
                <li
                  key={`${visit.shopId}-${visit.salesPersonId}-${visit.visitType}-${visit.capturedAt}`}
                >
                  <article className="grid gap-3 rounded-lg border border-stone-200 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/40 lg:grid-cols-[48px_1fr_auto] lg:items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 font-bold text-white">
                      {index + 1}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-stone-900">
                          {shop?.name || "Unknown shop"}
                        </h3>
                        <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                          {visitTypeLabels[visit.visitType]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-stone-600">
                        {shop?.area || getUnknownShopLabel(visit)} -{" "}
                        {getSalespersonName(userNameById, visit.salesPersonId)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock3
                            className="h-4 w-4 text-stone-400"
                            aria-hidden="true"
                          />
                          {formatDateTime(visit.capturedAt)}
                        </span>
                        <span>
                          Distance:{" "}
                          {visit.distanceMeters === null
                            ? "Not available"
                            : `${visit.distanceMeters} m`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                      {visit.latitude !== null && visit.longitude !== null ? (
                        <span className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">
                          <Navigation className="h-4 w-4" aria-hidden="true" />
                          {visit.latitude}, {visit.longitude}
                        </span>
                      ) : null}
                      {mapUrl ? (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-2 py-1 font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
                        >
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                          Map
                        </a>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Route
            className="mx-auto h-8 w-8 text-stone-400"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-bold text-stone-900">No GPS route rows</h3>
          <p className="mt-2 text-sm text-stone-600">
            No verified check-ins were found for this salesperson on the selected date.
          </p>
        </div>
      )}
    </section>
  );
}
