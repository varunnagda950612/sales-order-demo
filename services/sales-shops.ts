import type { SupabaseClient } from "@supabase/supabase-js";
import { getIndiaDate, getIndiaWeekday, getUtcRangeForIndiaDate, getWholeDayDifference } from "@/lib/dates/india";
import type { SalesRouteData, SalesRouteShop, ShopVisitDay, VisitOutcome } from "@/types/domain";

type ShopRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  area: string | null;
  visit_day: ShopVisitDay | null;
  assigned_to: string | null;
  location_lat: number | string | null;
  location_lng: number | string | null;
  location_accuracy: number | string | null;
  location_captured_at: string | null;
};

type AreaScheduleRow = {
  area: string;
  sales_person_id: string | null;
  visit_day: string;
  frequency: "weekly" | "biweekly";
  start_date: string;
};

type RouteOverrideRow = {
  area: string;
};

type VisitProofRow = {
  shop_id: string;
  visit_type: "check_in" | "order_started" | "no_order";
  captured_at: string;
};

function normalizeArea(area: string | null | undefined) {
  return (area || "Unassigned").trim().replace(/\s+/g, " ");
}

function areaKey(area: string | null | undefined) {
  return normalizeArea(area).toLowerCase();
}

function toNullableNumber(value: number | string | null) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isScheduleDue(schedule: AreaScheduleRow, selectedDate: string, weekday: string) {
  if (schedule.visit_day !== weekday) {
    return false;
  }

  if (schedule.frequency === "weekly") {
    return true;
  }

  const daysSinceStart = getWholeDayDifference(schedule.start_date, selectedDate);
  if (daysSinceStart < 0) {
    return false;
  }

  return Math.floor(daysSinceStart / 7) % 2 === 0;
}

function getScheduleForShop(shop: ShopRow, schedules: AreaScheduleRow[]) {
  const matchingSchedules = schedules.filter(
    (schedule) =>
      areaKey(schedule.area) === areaKey(shop.area) &&
      (!schedule.sales_person_id || schedule.sales_person_id === shop.assigned_to),
  );

  return (
    matchingSchedules.find((schedule) => schedule.sales_person_id === shop.assigned_to) ||
    matchingSchedules.find((schedule) => !schedule.sales_person_id) ||
    null
  );
}

function matchesAssignedFallbackRoute(shop: ShopRow, salesPersonId: string, weekday: string) {
  if (shop.assigned_to !== salesPersonId) {
    return false;
  }

  return !shop.visit_day || shop.visit_day === "as_required" || shop.visit_day === weekday;
}

function getVisitOutcome(proofs: VisitProofRow[]) {
  const priority: VisitOutcome[] = ["order_started", "no_order", "checked_in", "not_visited"];

  const outcomes = new Set<VisitOutcome>(
    proofs.map((proof) => (proof.visit_type === "check_in" ? "checked_in" : proof.visit_type)),
  );

  return priority.find((outcome) => outcomes.has(outcome)) || "not_visited";
}

const shopSelect =
  "id, name, phone, address, area, visit_day, assigned_to, location_lat, location_lng, location_accuracy, location_captured_at";

export async function getSalesRouteData(
  supabase: SupabaseClient,
  salesPersonId: string,
  selectedDate = getIndiaDate(),
): Promise<SalesRouteData> {
  const weekday = getIndiaWeekday(new Date(`${selectedDate}T12:00:00.000Z`));
  const { start, end } = getUtcRangeForIndiaDate(selectedDate);

  const [
    { data: schedulesData, error: schedulesError },
    { data: overridesData, error: overridesError },
    { data: visitProofsData, error: visitProofsError },
  ] = await Promise.all([
      supabase
        .from("area_route_schedules")
        .select("area, sales_person_id, visit_day, frequency, start_date"),
      supabase
        .from("route_overrides")
        .select("area")
        .eq("sales_person_id", salesPersonId)
        .eq("override_date", selectedDate),
      supabase
        .from("visit_proofs")
        .select("shop_id, visit_type, captured_at")
        .eq("sales_person_id", salesPersonId)
        .gte("captured_at", start)
        .lt("captured_at", end),
    ]);

  if (schedulesError) {
    throw new Error(schedulesError.message);
  }

  if (overridesError) {
    throw new Error(overridesError.message);
  }

  if (visitProofsError) {
    throw new Error(visitProofsError.message);
  }

  const schedules = (schedulesData || []) as AreaScheduleRow[];
  const overrides = (overridesData || []) as RouteOverrideRow[];
  const visitProofs = (visitProofsData || []) as VisitProofRow[];
  const overrideAreas = Array.from(new Set(overrides.map((override) => override.area)));
  const shopQueries = [
    supabase
      .from("shops")
      .select(shopSelect)
      .eq("assigned_to", salesPersonId)
      .order("area", { ascending: true })
      .order("name", { ascending: true }),
  ];

  if (overrideAreas.length) {
    shopQueries.push(
      supabase
        .from("shops")
        .select(shopSelect)
        .in("area", overrideAreas)
        .order("area", { ascending: true })
        .order("name", { ascending: true }),
    );
  }

  const shopResponses = await Promise.all(shopQueries);
  const shopRowsById = new Map<string, ShopRow>();

  shopResponses.forEach((response) => {
    if (response.error) {
      throw new Error(response.error.message);
    }

    ((response.data || []) as ShopRow[]).forEach((shop) => {
      shopRowsById.set(shop.id, shop);
    });
  });

  const shops = Array.from(shopRowsById.values());

  const overrideAreaKeys = new Set(overrides.map((override) => areaKey(override.area)));
  const hasRouteOverride = overrideAreaKeys.size > 0;

  const proofsByShopId = new Map<string, VisitProofRow[]>();
  visitProofs.forEach((proof) => {
    const existing = proofsByShopId.get(proof.shop_id) || [];
    existing.push(proof);
    proofsByShopId.set(proof.shop_id, existing);
  });

  const routeShops = shops
    .map((shop): SalesRouteShop | null => {
      const normalizedArea = normalizeArea(shop.area);
      const key = areaKey(normalizedArea);
      const isOverride = overrideAreaKeys.has(key);
      const isAssignedToSalesperson = shop.assigned_to === salesPersonId;
      const schedule = getScheduleForShop(shop, schedules);
      const isScheduled = Boolean(
        isAssignedToSalesperson && schedule && isScheduleDue(schedule, selectedDate, weekday),
      );
      const isFallbackVisitDay = !schedule && matchesAssignedFallbackRoute(shop, salesPersonId, weekday);
      const isVisibleFromOverride = hasRouteOverride && isOverride;
      const isVisibleFromNormalRoute = !hasRouteOverride && (isScheduled || isFallbackVisitDay);

      if (!isVisibleFromOverride && !isVisibleFromNormalRoute) {
        return null;
      }

      const latitude = toNullableNumber(shop.location_lat);
      const longitude = toNullableNumber(shop.location_lng);
      const gpsStatus = latitude !== null && longitude !== null ? "saved" : "pending";

      return {
        id: shop.id,
        name: shop.name,
        phone: shop.phone,
        address: shop.address,
        area: normalizedArea,
        visitDay: shop.visit_day,
        assignedTo: shop.assigned_to,
        locationLat: latitude,
        locationLng: longitude,
        locationAccuracy: toNullableNumber(shop.location_accuracy),
        locationCapturedAt: shop.location_captured_at,
        gpsStatus,
        visitOutcome: getVisitOutcome(proofsByShopId.get(shop.id) || []),
        isOverride,
        routeReason: isOverride ? "override" : isScheduled ? "schedule" : "shop_visit_day",
      };
    })
    .filter((shop): shop is SalesRouteShop => shop !== null)
    .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));

  const areaOptions = Array.from(new Set(routeShops.map((shop) => shop.area))).sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    shops: routeShops,
    areaOptions,
    overrideAreas: Array.from(new Set(overrides.map((override) => normalizeArea(override.area)))),
    summary: {
      selectedDate,
      weekday,
      totalShops: routeShops.length,
      gpsSavedCount: routeShops.filter((shop) => shop.gpsStatus === "saved").length,
      gpsPendingCount: routeShops.filter((shop) => shop.gpsStatus === "pending").length,
      visitedCount: routeShops.filter(
        (shop) =>
          shop.visitOutcome === "order_started" ||
          shop.visitOutcome === "no_order",
      ).length,
      overrideAreaCount: overrideAreaKeys.size,
    },
  };
}
