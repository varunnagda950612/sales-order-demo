import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesRouteShop, ShopVisitDay } from "@/types/domain";

export const localShopsStorageKey = "manish-masala-next.local-shops.v1";

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

function normalizeArea(area: string | null | undefined) {
  return (area || "Unassigned").trim().replace(/\s+/g, " ");
}

function toNullableNumber(value: number | string | null) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLocalShop(
  shop: ShopRow,
  remapAssignedTo?: { fromSalesPersonId: string; toSalesPersonId: string },
): SalesRouteShop {
  const latitude = toNullableNumber(shop.location_lat);
  const longitude = toNullableNumber(shop.location_lng);

  return {
    id: shop.id,
    name: shop.name,
    phone: shop.phone,
    address: shop.address,
    area: normalizeArea(shop.area),
    visitDay: shop.visit_day,
    assignedTo:
      remapAssignedTo && shop.assigned_to === remapAssignedTo.fromSalesPersonId
        ? remapAssignedTo.toSalesPersonId
        : shop.assigned_to,
    locationLat: latitude,
    locationLng: longitude,
    locationAccuracy: toNullableNumber(shop.location_accuracy),
    locationCapturedAt: shop.location_captured_at,
    gpsStatus: latitude !== null && longitude !== null ? "saved" : "pending",
    visitOutcome: "not_visited",
    isOverride: false,
    routeReason: "shop_visit_day",
  };
}

export function readLocalShops(_revision = 0) {
  void _revision;

  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(localShopsStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue)
      ? (parsedValue as SalesRouteShop[]).map((shop) => ({
          ...shop,
          area: normalizeArea(shop.area),
        }))
      : [];
  } catch {
    return [];
  }
}

export function writeLocalShops(shops: SalesRouteShop[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localShopsStorageKey, JSON.stringify(shops));
}

export function upsertLocalShop(shop: SalesRouteShop) {
  const shops = readLocalShops().filter((item) => item.id !== shop.id);
  writeLocalShops([...shops, shop].sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name)));
}

export function deleteLocalShop(shopId: string) {
  const shops = readLocalShops().filter((item) => item.id !== shopId);
  writeLocalShops(shops);
}

export async function seedLocalShops(
  supabase: SupabaseClient,
  remapAssignedTo?: { fromSalesPersonId: string; toSalesPersonId: string },
) {
  const { data, error } = await supabase
    .from("shops")
    .select(
      "id, name, phone, address, area, visit_day, assigned_to, location_lat, location_lng, location_accuracy, location_captured_at",
    )
    .order("area", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const shops = ((data || []) as ShopRow[]).map((shop) => toLocalShop(shop, remapAssignedTo));
  writeLocalShops(shops);
  return shops;
}
