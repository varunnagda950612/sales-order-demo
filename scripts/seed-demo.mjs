import process from "node:process";

const requiredConfirmation = "I_UNDERSTAND_THIS_IS_SYNTHETIC_DEMO_DATA";
const demoProjectRefPattern = /^[a-z0-9]{20}$/;

function demoUuid(groupPrefix, index) {
  return `${groupPrefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function getProjectRef(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname.toLowerCase();
  if (!hostname.endsWith(".supabase.co")) {
    throw new Error("SUPABASE_URL must use a supabase.co project host.");
  }
  return hostname.slice(0, -".supabase.co".length);
}

const supabaseUrl = requireEnvironment("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const expectedProjectRef = requireEnvironment("NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF");

if (process.env.NEXT_PUBLIC_APP_VARIANT !== "demo") {
  throw new Error("Refusing to seed: NEXT_PUBLIC_APP_VARIANT must be demo.");
}
if (!demoProjectRefPattern.test(expectedProjectRef) || getProjectRef(supabaseUrl) !== expectedProjectRef) {
  throw new Error("Refusing to seed: SUPABASE_URL does not match the explicit demo project ref.");
}
if (process.env.DEMO_SEED_CONFIRMATION !== requiredConfirmation) {
  throw new Error(`Refusing to seed: set DEMO_SEED_CONFIRMATION=${requiredConfirmation}.`);
}

const ids = {
  admin: demoUuid("10000000", 1),
  manager: demoUuid("10000000", 2),
  sales: demoUuid("10000000", 3),
  product1: demoUuid("30000000", 1),
  product2: demoUuid("30000000", 2),
  sku1: demoUuid("40000000", 1),
  sku2: demoUuid("40000000", 2),
  order1: demoUuid("50000000", 1),
  order2: demoUuid("50000000", 2),
  collectionGroup: demoUuid("60000000", 1),
  collection: demoUuid("60000000", 2),
  visit: demoUuid("70000000", 1),
  target: demoUuid("80000000", 1),
};

async function request(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function ensureAuthUser({ id, email, password, fullName, loginId, role }) {
  const existing = await request(`/auth/v1/admin/users/${id}`).catch(() => null);
  const payload = {
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, login_id: loginId, role, synthetic_demo: true },
  };
  await request(existing ? `/auth/v1/admin/users/${id}` : "/auth/v1/admin/users", {
    method: existing ? "PUT" : "POST",
    body: existing ? payload : { ...payload, id },
  });
}

async function upsert(table, rows, onConflict = "id") {
  await request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
const timestamp = now.toISOString();
const demoPassword = process.env.DEMO_USER_PASSWORD || "DemoOnly!2026";

const users = [
  { id: ids.admin, email: "admin@sales-order-demo.invalid", fullName: "Demo Admin", loginId: "admin", role: "admin" },
  { id: ids.manager, email: "manager@sales-order-demo.invalid", fullName: "Demo Manager", loginId: "manager", role: "manager" },
  { id: ids.sales, email: "sales@sales-order-demo.invalid", fullName: "Aarav Demo", loginId: "sales", role: "sales" },
];

const routeDayPlans = [
  { day: "sunday", area: "Demo Sunday Bazaar", baseLat: 26.8982, baseLng: 75.7698 },
  { day: "monday", area: "Demo Monday Market", baseLat: 26.9055, baseLng: 75.7784 },
  { day: "tuesday", area: "Demo Tuesday Circle", baseLat: 26.9131, baseLng: 75.7868 },
  { day: "wednesday", area: "Demo Wednesday Central", baseLat: 26.9207, baseLng: 75.7952 },
  { day: "thursday", area: "Demo Thursday Junction", baseLat: 26.9283, baseLng: 75.8036 },
  { day: "friday", area: "Demo Friday North", baseLat: 26.9359, baseLng: 75.812 },
  { day: "saturday", area: "Demo Saturday Avenue", baseLat: 26.9435, baseLng: 75.8204 },
];

const shopNameParts = [
  "Asha Provision",
  "Bharat General Store",
  "Chandan Kirana",
  "Diya Super Mart",
  "Ekta Retail",
  "Falcon Mini Mart",
  "Gauri Traders",
];

const routeShops = routeDayPlans.flatMap((plan, dayIndex) =>
  shopNameParts.map((shopNamePart, shopIndex) => {
    const shopNumber = dayIndex * shopNameParts.length + shopIndex + 1;

    return {
      id: demoUuid("20000000", shopNumber),
      name: `${shopNamePart} - ${plan.area.replace("Demo ", "")}`,
      phone: String(9000000000 + shopNumber),
      address: `${shopIndex + 1}, ${plan.area}, Jaipur demo route`,
      area: plan.area,
      visit_day: plan.day,
      assigned_to: ids.sales,
      location_lat: Number((plan.baseLat + shopIndex * 0.0011).toFixed(6)),
      location_lng: Number((plan.baseLng + shopIndex * 0.0013).toFixed(6)),
      location_accuracy: 10 + shopIndex,
      location_captured_at: timestamp,
      created_by: ids.admin,
    };
  }),
);

const routeSchedules = routeDayPlans.map((plan, index) => ({
  id: demoUuid("90000000", index + 1),
  area: plan.area,
  sales_person_id: ids.sales,
  visit_day: plan.day,
  frequency: "weekly",
  start_date: monthStart,
  created_by: ids.admin,
}));

const routeOrderShop = routeShops.find((shop) => shop.visit_day === "wednesday") || routeShops[0];
const adhocOrderShop =
  routeShops.find((shop) => shop.visit_day === "wednesday" && shop.id !== routeOrderShop.id) ||
  routeShops[1];

for (const user of users) await ensureAuthUser({ ...user, password: demoPassword });
await upsert("profiles", users.map((user) => ({
  id: user.id, full_name: user.fullName, login_id: user.loginId, role: user.role,
  active: true, geofence_meters: user.role === "sales" ? 150 : 100,
})), "id");

await upsert("products", [
  { id: ids.product1, name: "Demo Turmeric Powder", category: "Demo Spices", active: true },
  { id: ids.product2, name: "Demo Coriander Powder", category: "Demo Spices", active: true },
]);
await upsert("product_skus", [
  { id: ids.sku1, product_id: ids.product1, sku_size: "100 g", sku_code: "DEMO-TUR-100", rate: 42, mrp: 50, active: true },
  { id: ids.sku2, product_id: ids.product2, sku_size: "200 g", sku_code: "DEMO-COR-200", rate: 68, mrp: 80, active: true },
]);
await upsert("shops", routeShops);
await upsert("area_route_schedules", routeSchedules);
await upsert("sales_targets", [{ id: ids.target, sales_person_id: ids.sales, product_id: ids.product1, product_sku_id: ids.sku1, product_name: "Demo Turmeric Powder", sku_size: "100 g", sku_code: "DEMO-TUR-100", grams: 100, target_kg: 12, start_date: monthStart, end_date: monthEnd, created_by: ids.admin }]);
await upsert("orders", [
  { id: ids.order1, shop_id: routeOrderShop.id, sales_person_id: ids.sales, sales_person_name: "Aarav Demo", order_type: "route", status: "placed", notes: "Synthetic route order", subtotal: 420, gst_rate: 0.05, gst_amount: 21, grand_total: 441, visit_lat: routeOrderShop.location_lat, visit_lng: routeOrderShop.location_lng, visit_accuracy: routeOrderShop.location_accuracy, visit_captured_at: timestamp, change_log: [], created_at: timestamp, updated_at: timestamp, client_updated_at: timestamp },
  { id: ids.order2, shop_id: adhocOrderShop.id, sales_person_id: ids.sales, sales_person_name: "Aarav Demo", order_type: "adhoc", status: "placed", notes: "Synthetic ad hoc order", subtotal: 340, gst_rate: 0.05, gst_amount: 17, grand_total: 357, visit_lat: adhocOrderShop.location_lat, visit_lng: adhocOrderShop.location_lng, visit_accuracy: adhocOrderShop.location_accuracy, visit_captured_at: timestamp, change_log: [], created_at: timestamp, updated_at: timestamp, client_updated_at: timestamp },
]);
await upsert("order_items", [
  { id: "51000000-0000-4000-8000-000000000001", order_id: ids.order1, product_id: ids.product1, product_sku_id: ids.sku1, product_name: "Demo Turmeric Powder", sku_size: "100 g", sku_code: "DEMO-TUR-100", rate: 42, mrp: 50, quantity: 10 },
  { id: "51000000-0000-4000-8000-000000000002", order_id: ids.order2, product_id: ids.product2, product_sku_id: ids.sku2, product_name: "Demo Coriander Powder", sku_size: "200 g", sku_code: "DEMO-COR-200", rate: 68, mrp: 80, quantity: 5 },
]);
await upsert("visit_proofs", [{ id: ids.visit, shop_id: routeOrderShop.id, order_id: ids.order1, sales_person_id: ids.sales, latitude: routeOrderShop.location_lat, longitude: routeOrderShop.location_lng, accuracy: routeOrderShop.location_accuracy, distance_meters: 8, captured_at: timestamp, visit_type: "order_started", client_event_id: ids.visit }]);
await upsert("collections", [{ id: ids.collection, client_group_id: ids.collectionGroup, shop_id: routeOrderShop.id, sales_person_id: ids.sales, collection_type: "route", status: "placed", notes: "Synthetic payment", bill_date: today, bill_number: "DEMO-BILL-001", amount: 250, discount: 10, replacement: 0, payment_mode: "upi", created_at: timestamp, updated_at: timestamp, client_updated_at: timestamp }]);

console.log(`Synthetic demo data seeded into ${expectedProjectRef}.`);
console.log(`Demo logins: admin, manager, sales / password: ${demoPassword}`);
