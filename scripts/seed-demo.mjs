import process from "node:process";

const requiredConfirmation = "I_UNDERSTAND_THIS_IS_SYNTHETIC_DEMO_DATA";
const demoProjectRefPattern = /^[a-z0-9]{20}$/;

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
  admin: "10000000-0000-4000-8000-000000000001",
  manager: "10000000-0000-4000-8000-000000000002",
  sales: "10000000-0000-4000-8000-000000000003",
  shop1: "20000000-0000-4000-8000-000000000001",
  shop2: "20000000-0000-4000-8000-000000000002",
  shop3: "20000000-0000-4000-8000-000000000003",
  product1: "30000000-0000-4000-8000-000000000001",
  product2: "30000000-0000-4000-8000-000000000002",
  sku1: "40000000-0000-4000-8000-000000000001",
  sku2: "40000000-0000-4000-8000-000000000002",
  order1: "50000000-0000-4000-8000-000000000001",
  order2: "50000000-0000-4000-8000-000000000002",
  collectionGroup: "60000000-0000-4000-8000-000000000001",
  collection: "60000000-0000-4000-8000-000000000002",
  visit: "70000000-0000-4000-8000-000000000001",
  target: "80000000-0000-4000-8000-000000000001",
  schedule: "90000000-0000-4000-8000-000000000001",
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
await upsert("shops", [
  { id: ids.shop1, name: "Sunrise Demo Mart", phone: "9000000001", address: "Demo Market Road, Jaipur", area: "Demo Central", visit_day: "wednesday", assigned_to: ids.sales, location_lat: 26.9124, location_lng: 75.7873, location_accuracy: 12, location_captured_at: timestamp, created_by: ids.admin },
  { id: ids.shop2, name: "Bluebird Sample Store", phone: "9000000002", address: "Sample Colony, Jaipur", area: "Demo Central", visit_day: "wednesday", assigned_to: ids.sales, location_lat: 26.9141, location_lng: 75.7901, location_accuracy: 15, location_captured_at: timestamp, created_by: ids.admin },
  { id: ids.shop3, name: "Green Basket Test Shop", phone: "9000000003", address: "Test Avenue, Jaipur", area: "Demo North", visit_day: "friday", assigned_to: ids.sales, location_lat: 26.935, location_lng: 75.8002, location_accuracy: 18, location_captured_at: timestamp, created_by: ids.admin },
]);
await upsert("area_route_schedules", [{ id: ids.schedule, area: "Demo Central", sales_person_id: ids.sales, visit_day: "wednesday", frequency: "weekly", start_date: monthStart, created_by: ids.admin }]);
await upsert("sales_targets", [{ id: ids.target, sales_person_id: ids.sales, product_id: ids.product1, product_sku_id: ids.sku1, product_name: "Demo Turmeric Powder", sku_size: "100 g", sku_code: "DEMO-TUR-100", grams: 100, target_kg: 12, start_date: monthStart, end_date: monthEnd, created_by: ids.admin }]);
await upsert("orders", [
  { id: ids.order1, shop_id: ids.shop1, sales_person_id: ids.sales, sales_person_name: "Aarav Demo", order_type: "route", status: "placed", notes: "Synthetic route order", subtotal: 420, gst_rate: 0.05, gst_amount: 21, grand_total: 441, visit_lat: 26.9124, visit_lng: 75.7873, visit_accuracy: 12, visit_captured_at: timestamp, change_log: [], created_at: timestamp, updated_at: timestamp, client_updated_at: timestamp },
  { id: ids.order2, shop_id: ids.shop2, sales_person_id: ids.sales, sales_person_name: "Aarav Demo", order_type: "adhoc", status: "placed", notes: "Synthetic ad hoc order", subtotal: 340, gst_rate: 0.05, gst_amount: 17, grand_total: 357, visit_lat: 26.9141, visit_lng: 75.7901, visit_accuracy: 15, visit_captured_at: timestamp, change_log: [], created_at: timestamp, updated_at: timestamp, client_updated_at: timestamp },
]);
await upsert("order_items", [
  { id: "51000000-0000-4000-8000-000000000001", order_id: ids.order1, product_id: ids.product1, product_sku_id: ids.sku1, product_name: "Demo Turmeric Powder", sku_size: "100 g", sku_code: "DEMO-TUR-100", rate: 42, mrp: 50, quantity: 10 },
  { id: "51000000-0000-4000-8000-000000000002", order_id: ids.order2, product_id: ids.product2, product_sku_id: ids.sku2, product_name: "Demo Coriander Powder", sku_size: "200 g", sku_code: "DEMO-COR-200", rate: 68, mrp: 80, quantity: 5 },
]);
await upsert("visit_proofs", [{ id: ids.visit, shop_id: ids.shop1, order_id: ids.order1, sales_person_id: ids.sales, latitude: 26.9124, longitude: 75.7873, accuracy: 12, distance_meters: 8, captured_at: timestamp, visit_type: "order_started", client_event_id: ids.visit }]);
await upsert("collections", [{ id: ids.collection, client_group_id: ids.collectionGroup, shop_id: ids.shop1, sales_person_id: ids.sales, collection_type: "route", status: "placed", notes: "Synthetic payment", bill_date: today, bill_number: "DEMO-BILL-001", amount: 250, discount: 10, replacement: 0, payment_mode: "upi", created_at: timestamp, updated_at: timestamp, client_updated_at: timestamp }]);

console.log(`Synthetic demo data seeded into ${expectedProjectRef}.`);
console.log(`Demo logins: admin, manager, sales / password: ${demoPassword}`);
