import type { SalesRouteData } from "@/types/domain";

export const salesRouteSnapshotStorageKey = "manish-masala-next.sales-route-snapshot.v1";

type SalesRouteSnapshot = {
  salesPersonId: string;
  savedAt: string;
  routeData: SalesRouteData;
};

export function readSalesRouteSnapshot(salesPersonId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(salesRouteSnapshotStorageKey);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<SalesRouteSnapshot>;

    if (parsedValue.salesPersonId !== salesPersonId || !parsedValue.routeData) {
      return null;
    }

    return parsedValue as SalesRouteSnapshot;
  } catch {
    return null;
  }
}

export function writeSalesRouteSnapshot(salesPersonId: string, routeData: SalesRouteData) {
  if (typeof window === "undefined") {
    return;
  }

  const snapshot: SalesRouteSnapshot = {
    salesPersonId,
    savedAt: new Date().toISOString(),
    routeData,
  };

  window.localStorage.setItem(salesRouteSnapshotStorageKey, JSON.stringify(snapshot));
}

export function getEmptySalesRouteData(): SalesRouteData {
  const today = new Date().toISOString().slice(0, 10);

  return {
    shops: [],
    areaOptions: [],
    overrideAreas: [],
    summary: {
      selectedDate: today,
      weekday: "today",
      totalShops: 0,
      gpsSavedCount: 0,
      gpsPendingCount: 0,
      visitedCount: 0,
      overrideAreaCount: 0,
    },
  };
}
