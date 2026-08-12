export type AppRole = "admin" | "manager" | "sales";

export type DashboardTab = {
  id: string;
  label: string;
  description: string;
};

export type UserProfile = {
  id: string;
  fullName: string;
  role: AppRole;
  loginId: string;
  active: boolean;
  geofenceMeters: number | null;
};

export type ShopGpsStatus = "saved" | "pending";

export type VisitOutcome = "not_visited" | "checked_in" | "order_started" | "no_order";

export type ShopVisitDay =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "as_required";

export type AreaRouteSchedule = {
  id: string;
  area: string;
  salesPersonId: string | null;
  visitDay: Exclude<ShopVisitDay, "as_required">;
  frequency: "weekly" | "biweekly";
  startDate: string;
};

export type RouteOverride = {
  id: string;
  salesPersonId: string;
  overrideDate: string;
  area: string;
};

export type SalesDaySessionStatus = "active" | "on_break" | "ended";

export type SalesDaySession = {
  id: string;
  salesPersonId: string;
  workDate: string;
  status: SalesDaySessionStatus;
  startedAt: string;
  startLat: number | null;
  startLng: number | null;
  startAccuracy: number | null;
  lunchStartedAt: string | null;
  lunchStartLat: number | null;
  lunchStartLng: number | null;
  lunchStartAccuracy: number | null;
  lunchEndedAt: string | null;
  lunchEndLat: number | null;
  lunchEndLng: number | null;
  lunchEndAccuracy: number | null;
  endedAt: string | null;
  endLat: number | null;
  endLng: number | null;
  endAccuracy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesRouteShop = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  area: string;
  visitDay: ShopVisitDay | null;
  assignedTo: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAccuracy: number | null;
  locationCapturedAt: string | null;
  gpsStatus: ShopGpsStatus;
  visitOutcome: VisitOutcome;
  isOverride: boolean;
  routeReason: "schedule" | "shop_visit_day" | "override";
};

export type SalesRouteSummary = {
  selectedDate: string;
  weekday: string;
  totalShops: number;
  gpsSavedCount: number;
  gpsPendingCount: number;
  visitedCount: number;
  overrideAreaCount: number;
};

export type SalesRouteData = {
  shops: SalesRouteShop[];
  areaOptions: string[];
  overrideAreas: string[];
  summary: SalesRouteSummary;
};

export type LocalProductSku = {
  id: string;
  productId: string;
  productName: string;
  category: string | null;
  photoUrl: string | null;
  skuSize: string;
  skuCode: string | null;
  rate: number;
  mrp: number;
};

export type LocalOrderItem = {
  skuId: string;
  productId: string;
  productName: string;
  skuSize: string;
  skuCode: string | null;
  rate: number;
  mrp: number;
  quantity: number;
  lineTotal: number;
};

export type LocalOrder = {
  id: string;
  shopId: string;
  salesPersonId: string;
  orderType: "route" | "adhoc";
  status: "placed" | "updated" | "cancelled";
  notes: string;
  replacementNotes: string;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;
  items: LocalOrderItem[];
  visitLat: number | null;
  visitLng: number | null;
  visitAccuracy: number | null;
  visitCapturedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentMode = "cash" | "cheque" | "upi";

export type LocalCollectionBill = {
  id: string;
  billDate: string;
  billNumber: string;
  notes: string;
  amount: number;
  discount: number;
  replacement: number;
  paymentMode: PaymentMode;
  chequeDate: string | null;
};

export type LocalCollection = {
  id: string;
  shopId: string;
  salesPersonId: string;
  collectionType: "route" | "adhoc";
  status: "placed" | "updated" | "cancelled";
  bills: LocalCollectionBill[];
  createdAt: string;
  updatedAt: string;
};

export type LocalSalesTarget = {
  id: string;
  salesPersonId: string;
  productId: string | null;
  productSkuId: string | null;
  productName: string;
  skuSize: string;
  skuCode: string | null;
  grams: number;
  targetKg: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};
