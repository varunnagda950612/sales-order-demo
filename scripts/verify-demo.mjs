import process from "node:process";

const expectedProjectRef = process.env.NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF?.trim();
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (process.env.NEXT_PUBLIC_APP_VARIANT !== "demo") {
  throw new Error("Refusing verification: NEXT_PUBLIC_APP_VARIANT must be demo.");
}

if (!expectedProjectRef || !supabaseUrl || !serverKey) {
  throw new Error("Missing demo verification environment variables.");
}

const actualProjectRef = new URL(supabaseUrl).hostname.split(".")[0];

if (actualProjectRef !== expectedProjectRef) {
  throw new Error("Refusing verification: Supabase URL does not match the explicit demo project ref.");
}

const headers = {
  apikey: serverKey,
  Authorization: `Bearer ${serverKey}`,
};

const demoSalesId = "10000000-0000-4000-8000-000000000003";
const routeVisitDays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const mumbaiBounds = {
  minLat: 18.88,
  maxLat: 19.31,
  minLng: 72.75,
  maxLng: 73.02,
};

async function readJson(path) {
  const response = await fetch(`${supabaseUrl}${path}`, { headers });

  if (!response.ok) {
    throw new Error(`Verification request failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

const tableNames = [
  "profiles",
  "shops",
  "products",
  "product_skus",
  "orders",
  "order_items",
  "visit_proofs",
  "collections",
  "sales_targets",
  "area_route_schedules",
];

const counts = {};

for (const tableName of tableNames) {
  const rows = await readJson(`/rest/v1/${tableName}?select=id`);
  counts[tableName] = Array.isArray(rows) ? rows.length : 0;
}

const authResult = await readJson("/auth/v1/admin/users?page=1&per_page=50");
counts.auth_users = Array.isArray(authResult.users) ? authResult.users.length : 0;

const requiredMinimums = {
  auth_users: 3,
  profiles: 3,
  shops: 49,
  products: 2,
  product_skus: 2,
  orders: 2,
  order_items: 2,
  visit_proofs: 1,
  collections: 1,
  sales_targets: 1,
  area_route_schedules: 7,
};

for (const [name, minimum] of Object.entries(requiredMinimums)) {
  if ((counts[name] || 0) < minimum) {
    throw new Error(`Demo verification failed: ${name} has ${counts[name] || 0}, expected at least ${minimum}.`);
  }
}

const [shops, schedules] = await Promise.all([
  readJson("/rest/v1/shops?select=id,area,assigned_to,address,location_lat,location_lng"),
  readJson("/rest/v1/area_route_schedules?select=id,area,visit_day,sales_person_id"),
]);

for (const visitDay of routeVisitDays) {
  const scheduledAreas = new Set(
    schedules
      .filter((schedule) => schedule.visit_day === visitDay && schedule.sales_person_id === demoSalesId)
      .map((schedule) => schedule.area),
  );
  const routeShopCount = shops.filter(
    (shop) => shop.assigned_to === demoSalesId && scheduledAreas.has(shop.area),
  ).length;

  counts[`route_${visitDay}_shops`] = routeShopCount;

  if (routeShopCount < 6) {
    throw new Error(
      `Demo verification failed: ${visitDay} route has ${routeShopCount} shop(s), expected at least 6.`,
    );
  }

  const invalidMumbaiShop = shops.find((shop) => {
    if (shop.assigned_to !== demoSalesId || !scheduledAreas.has(shop.area)) {
      return false;
    }

    const latitude = Number(shop.location_lat);
    const longitude = Number(shop.location_lng);
    const hasMumbaiAddress = String(shop.address || "").toLowerCase().includes("mumbai");

    return (
      !hasMumbaiAddress ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < mumbaiBounds.minLat ||
      latitude > mumbaiBounds.maxLat ||
      longitude < mumbaiBounds.minLng ||
      longitude > mumbaiBounds.maxLng
    );
  });

  if (invalidMumbaiShop) {
    throw new Error(
      `Demo verification failed: ${visitDay} route shop ${invalidMumbaiShop.id} is not using a Mumbai address/GPS anchor.`,
    );
  }
}

console.log(`Verified synthetic demo data in ${expectedProjectRef}.`);
Object.entries(counts)
  .sort(([left], [right]) => left.localeCompare(right))
  .forEach(([name, count]) => console.log(`${name}=${count}`));
