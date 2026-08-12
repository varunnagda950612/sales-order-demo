import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AreaRouteSchedule,
  LocalCollection,
  LocalOrder,
  LocalOrderItem,
  LocalSalesTarget,
  PaymentMode,
  SalesRouteShop,
  SalesDaySession,
  SalesDaySessionStatus,
  ShopVisitDay,
  RouteOverride,
  UserProfile,
} from "@/types/domain";
import type { LocalVisitRecord } from "@/lib/local/visit-proofs";

type NumberLike = number | string | null | undefined;

type SupabaseOrderRow = {
  id: string;
  shop_id: string;
  sales_person_id: string;
  order_type: "route" | "adhoc";
  status: "placed" | "updated" | "cancelled";
  notes: string | null;
  replacement_notes: string | null;
  subtotal: NumberLike;
  gst_rate: NumberLike;
  gst_amount: NumberLike;
  grand_total: NumberLike;
  visit_lat: NumberLike;
  visit_lng: NumberLike;
  visit_accuracy: NumberLike;
  visit_captured_at: string | null;
  created_at: string;
  updated_at: string;
  order_items?: SupabaseOrderItemRow[];
  shops?: SupabaseShopRelation;
};

type SupabaseOrderItemRow = {
  product_sku_id: string | null;
  product_id: string | null;
  product_name: string;
  sku_size: string;
  sku_code: string | null;
  rate: NumberLike;
  mrp: NumberLike;
  quantity: number | string;
  line_total: NumberLike;
};

type SupabaseCollectionRow = {
  id: string;
  shop_id: string;
  sales_person_id: string;
  collection_type: "route" | "adhoc";
  notes?: string | null;
  bill_date: string;
  bill_number: string;
  cheque_date: string | null;
  amount: NumberLike;
  discount: NumberLike;
  replacement: NumberLike;
  payment_mode: PaymentMode;
  created_at: string;
  client_group_id?: string | null;
  status?: "placed" | "updated" | "cancelled" | null;
  updated_at?: string | null;
  shops?: SupabaseShopRelation;
};

type SupabaseVisitProofRow = {
  id?: string;
  order_id?: string | null;
  shop_id: string;
  sales_person_id: string;
  visit_type: "check_in" | "order_started" | "no_order" | null;
  latitude: NumberLike;
  longitude: NumberLike;
  accuracy: NumberLike;
  distance_meters: NumberLike;
  captured_at: string;
  shops?: SupabaseShopRelation;
};

type SupabaseShopRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  area: string | null;
  visit_day: ShopVisitDay | null;
  assigned_to: string | null;
  location_lat: NumberLike;
  location_lng: NumberLike;
  location_accuracy: NumberLike;
  location_captured_at: string | null;
};

type SupabaseShopRelation = SupabaseShopRow | SupabaseShopRow[] | null;

type SupabaseProductSkuRow = {
  id: string;
  product_id: string;
  sku_size: string;
  sku_code: string | null;
  rate: NumberLike;
  mrp: NumberLike;
  products:
    | {
    name: string;
    category: string | null;
    photo_url: string | null;
  }
    | Array<{
        name: string;
        category: string | null;
        photo_url: string | null;
      }>
    | null;
};

type SupabaseTargetRow = {
  id: string;
  sales_person_id: string;
  product_id: string | null;
  product_sku_id: string | null;
  product_name: string;
  sku_size: string;
  sku_code: string | null;
  grams: NumberLike;
  target_kg: NumberLike;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

type SupabaseProfileRow = {
  id: string;
  full_name: string | null;
  role: "admin" | "manager" | "sales" | null;
  login_id: string | null;
  active: boolean | null;
  geofence_meters: NumberLike;
};

type SupabaseSalesDaySessionRow = {
  id: string;
  sales_person_id: string;
  work_date: string;
  status: SalesDaySessionStatus | null;
  started_at: string;
  start_lat?: NumberLike;
  start_lng?: NumberLike;
  start_accuracy?: NumberLike;
  lunch_started_at: string | null;
  lunch_start_lat?: NumberLike;
  lunch_start_lng?: NumberLike;
  lunch_start_accuracy?: NumberLike;
  lunch_ended_at: string | null;
  lunch_end_lat?: NumberLike;
  lunch_end_lng?: NumberLike;
  lunch_end_accuracy?: NumberLike;
  ended_at: string | null;
  end_lat?: NumberLike;
  end_lng?: NumberLike;
  end_accuracy?: NumberLike;
  created_at: string;
  updated_at: string;
};

type SupabaseAreaRouteScheduleRow = {
  id: string;
  area: string;
  sales_person_id: string | null;
  visit_day: AreaRouteSchedule["visitDay"];
  frequency: AreaRouteSchedule["frequency"];
  start_date: string;
};

type SupabaseRouteOverrideRow = {
  id: string;
  sales_person_id: string;
  override_date: string;
  area: string;
};

type SupabaseOrderSummaryRow = {
  total_count: NumberLike;
  updated_count: NumberLike;
  adhoc_count: NumberLike;
};

type SupabaseCollectionSummaryRow = {
  row_count: NumberLike;
  cash_total: NumberLike;
  cheque_total: NumberLike;
  upi_total: NumberLike;
  total_amount: NumberLike;
};

type SupabaseShopAreaRow = {
  area: string | null;
};

type ScopedReadOptions = {
  salesPersonId?: string;
  area?: string;
  paymentMode?: PaymentMode;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  capturedAtFrom?: string;
  capturedAtTo?: string;
  workDate?: string;
  workDateFrom?: string;
  workDateTo?: string;
  limit?: number;
  offset?: number;
  ascending?: boolean;
};

type SupabaseReadResponse = {
  data: unknown;
  error: { message: string } | null;
};

const transientReadRetryDelaysMs = [300, 900];
const orderBaseSelect =
  "id, shop_id, sales_person_id, order_type, status, notes, replacement_notes, subtotal, gst_rate, gst_amount, grand_total, visit_lat, visit_lng, visit_accuracy, visit_captured_at, created_at, updated_at";
const orderItemsSelect =
  "order_items(product_sku_id, product_id, product_name, sku_size, sku_code, rate, mrp, quantity, line_total)";
const shopRelationSelect =
  "shops(id, name, phone, address, area, visit_day, assigned_to, location_lat, location_lng, location_accuracy, location_captured_at)";
const innerShopRelationSelect =
  "shops!inner(id, name, phone, address, area, visit_day, assigned_to, location_lat, location_lng, location_accuracy, location_captured_at)";

function getOrdersWithShopsSelect(options: ScopedReadOptions, includeItems: boolean) {
  const relatedShopSelect = options.area ? innerShopRelationSelect : shopRelationSelect;

  return includeItems
    ? `${orderBaseSelect}, ${orderItemsSelect}, ${relatedShopSelect}`
    : `${orderBaseSelect}, ${relatedShopSelect}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

function isTransientReadFailure(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return [
    "fetch failed",
    "failed to fetch",
    "network",
    "timeout",
    "timed out",
    "econnreset",
    "eai_again",
    "socket",
    "connection reset",
    "connection terminated",
  ].some((value) => message.includes(value));
}

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function runSupabaseRead<TResponse extends SupabaseReadResponse>(
  operation: () => PromiseLike<TResponse>,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await operation();
      const retryDelay = transientReadRetryDelaysMs[attempt];

      if (!response.error || retryDelay === undefined || !isTransientReadFailure(response.error)) {
        return response;
      }

      await waitForRetry(retryDelay);
    } catch (error) {
      const retryDelay = transientReadRetryDelaysMs[attempt];

      if (retryDelay === undefined || !isTransientReadFailure(error)) {
        throw error;
      }

      await waitForRetry(retryDelay);
    }
  }
}

function toNumber(value: NumberLike) {
  const parsedValue = Number(value || 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function toNullableNumber(value: NumberLike) {
  if (value === null || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeArea(area: string | null | undefined) {
  return (area || "Unassigned").trim().replace(/\s+/g, " ");
}

function mapOrderItem(row: SupabaseOrderItemRow): LocalOrderItem {
  return {
    skuId: row.product_sku_id || "",
    productId: row.product_id || "",
    productName: row.product_name,
    skuSize: row.sku_size,
    skuCode: row.sku_code,
    rate: toNumber(row.rate),
    mrp: toNumber(row.mrp),
    quantity: Number(row.quantity || 0),
    lineTotal: toNumber(row.line_total),
  };
}

function mapOrder(row: SupabaseOrderRow): LocalOrder {
  return {
    id: row.id,
    shopId: row.shop_id,
    salesPersonId: row.sales_person_id,
    orderType: row.order_type,
    status: row.status,
    notes: row.notes || "",
    replacementNotes: row.replacement_notes || "",
    subtotal: toNumber(row.subtotal),
    gstRate: toNumber(row.gst_rate),
    gstAmount: toNumber(row.gst_amount),
    grandTotal: toNumber(row.grand_total),
    items: (row.order_items || []).map(mapOrderItem),
    visitLat: toNullableNumber(row.visit_lat),
    visitLng: toNullableNumber(row.visit_lng),
    visitAccuracy: toNullableNumber(row.visit_accuracy),
    visitCapturedAt: row.visit_captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCollections(rows: SupabaseCollectionRow[]): LocalCollection[] {
  const rowsByGroupId = new Map<string, SupabaseCollectionRow[]>();

  rows.forEach((row) => {
    const groupId = row.client_group_id || row.id;
    const groupRows = rowsByGroupId.get(groupId) || [];
    groupRows.push(row);
    rowsByGroupId.set(groupId, groupRows);
  });

  return Array.from(rowsByGroupId.entries()).map(([groupId, groupRows]) => {
    const activeRows = groupRows.filter((row) => row.status !== "cancelled");
    const displayRows = activeRows.length ? activeRows : groupRows;
    const firstRow = displayRows[0];
    const isUpdated = activeRows.some((row) => row.status === "updated");

    return {
      id: groupId,
      shopId: firstRow.shop_id,
      salesPersonId: firstRow.sales_person_id,
      collectionType: firstRow.collection_type,
      status: activeRows.length ? (isUpdated ? "updated" : "placed") : "cancelled",
      bills: displayRows.map((row) => ({
        id: row.id,
        billDate: row.bill_date,
        billNumber: row.bill_number,
        notes: row.notes || "",
        amount: toNumber(row.amount),
        discount: toNumber(row.discount),
        replacement: toNumber(row.replacement),
        paymentMode: row.payment_mode,
        chequeDate: row.cheque_date,
      })),
      createdAt: firstRow.created_at,
      updatedAt: groupRows.reduce(
        (latestValue, row) =>
          (row.updated_at || row.created_at) > latestValue
            ? row.updated_at || row.created_at
            : latestValue,
        firstRow.updated_at || firstRow.created_at,
      ),
    };
  });
}

function mapVisitProof(row: SupabaseVisitProofRow): LocalVisitRecord {
  return {
    id: row.id || `server-${row.shop_id}-${row.sales_person_id}-${row.captured_at}-${row.visit_type || "check_in"}`,
    shopId: row.shop_id,
    orderId: row.order_id || null,
    salesPersonId: row.sales_person_id,
    visitType: row.visit_type || "check_in",
    latitude: toNullableNumber(row.latitude),
    longitude: toNullableNumber(row.longitude),
    accuracy: toNullableNumber(row.accuracy),
    distanceMeters: toNullableNumber(row.distance_meters),
    capturedAt: row.captured_at,
    saveShopAnchor: false,
  };
}

function mapShop(row: SupabaseShopRow): SalesRouteShop {
  const latitude = toNullableNumber(row.location_lat);
  const longitude = toNullableNumber(row.location_lng);

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    area: normalizeArea(row.area),
    visitDay: row.visit_day,
    assignedTo: row.assigned_to,
    locationLat: latitude,
    locationLng: longitude,
    locationAccuracy: toNullableNumber(row.location_accuracy),
    locationCapturedAt: row.location_captured_at,
    gpsStatus: latitude !== null && longitude !== null ? "saved" : "pending",
    visitOutcome: "not_visited",
    isOverride: false,
    routeReason: "shop_visit_day",
  };
}

function getRelatedShop(row: { shops?: SupabaseShopRelation }) {
  if (!row.shops) {
    return null;
  }

  return Array.isArray(row.shops) ? row.shops[0] || null : row.shops;
}

export function mergeUniqueShops(...shopLists: SalesRouteShop[][]) {
  const shopById = new Map<string, SalesRouteShop>();

  shopLists.flat().forEach((shop) => {
    shopById.set(shop.id, shop);
  });

  return Array.from(shopById.values()).sort(
    (a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name),
  );
}

function mapTarget(row: SupabaseTargetRow): LocalSalesTarget {
  return {
    id: row.id,
    salesPersonId: row.sales_person_id,
    productId: row.product_id,
    productSkuId: row.product_sku_id,
    productName: row.product_name,
    skuSize: row.sku_size,
    skuCode: row.sku_code,
    grams: toNumber(row.grams),
    targetKg: toNumber(row.target_kg),
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSalesDaySession(row: SupabaseSalesDaySessionRow): SalesDaySession {
  return {
    id: row.id,
    salesPersonId: row.sales_person_id,
    workDate: row.work_date,
    status: row.status || "active",
    startedAt: row.started_at,
    startLat: toNullableNumber(row.start_lat),
    startLng: toNullableNumber(row.start_lng),
    startAccuracy: toNullableNumber(row.start_accuracy),
    lunchStartedAt: row.lunch_started_at,
    lunchStartLat: toNullableNumber(row.lunch_start_lat),
    lunchStartLng: toNullableNumber(row.lunch_start_lng),
    lunchStartAccuracy: toNullableNumber(row.lunch_start_accuracy),
    lunchEndedAt: row.lunch_ended_at,
    lunchEndLat: toNullableNumber(row.lunch_end_lat),
    lunchEndLng: toNullableNumber(row.lunch_end_lng),
    lunchEndAccuracy: toNullableNumber(row.lunch_end_accuracy),
    endedAt: row.ended_at,
    endLat: toNullableNumber(row.end_lat),
    endLng: toNullableNumber(row.end_lng),
    endAccuracy: toNullableNumber(row.end_accuracy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function readSupabaseOrders(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const pageSize = 1000;
  const rowLimit = options.limit ?? Number.POSITIVE_INFINITY;
  const rows: SupabaseOrderRow[] = [];

  for (let start = options.offset ?? 0; rows.length < rowLimit; start += pageSize) {
    const batchSize = Math.min(pageSize, rowLimit - rows.length);
    const { data, error } = await runSupabaseRead(() => {
      let query = supabase
        .from("orders")
        .select(`${orderBaseSelect}, ${orderItemsSelect}`)
        .order("created_at", { ascending: options.ascending ?? false })
        .range(start, start + batchSize - 1);

      if (options.salesPersonId) {
        query = query.eq("sales_person_id", options.salesPersonId);
      }

      if (options.createdAtFrom) {
        query = query.gte("created_at", options.createdAtFrom);
      }

      if (options.createdAtTo) {
        query = query.lt("created_at", options.createdAtTo);
      }

      return query;
    });

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data || []) as unknown as SupabaseOrderRow[];
    rows.push(...pageRows);

    if (pageRows.length < batchSize) {
      break;
    }
  }

  return rows.map(mapOrder);
}

async function readSupabaseOrderRowsWithShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
  includeItems: boolean,
) {
  const pageSize = 1000;
  const rowLimit = options.limit ?? Number.POSITIVE_INFINITY;
  const rows: SupabaseOrderRow[] = [];

  for (let start = options.offset ?? 0; rows.length < rowLimit; start += pageSize) {
    const batchSize = Math.min(pageSize, rowLimit - rows.length);
    const { data, error } = await runSupabaseRead(() => {
      let query = supabase
        .from("orders")
        .select(getOrdersWithShopsSelect(options, includeItems))
        .order("created_at", { ascending: options.ascending ?? false })
        .range(start, start + batchSize - 1);

      if (options.salesPersonId) {
        query = query.eq("sales_person_id", options.salesPersonId);
      }

      if (options.createdAtFrom) {
        query = query.gte("created_at", options.createdAtFrom);
      }

      if (options.createdAtTo) {
        query = query.lt("created_at", options.createdAtTo);
      }

      if (options.updatedAtFrom) {
        query = query.gte("updated_at", options.updatedAtFrom);
      }

      if (options.updatedAtTo) {
        query = query.lt("updated_at", options.updatedAtTo);
      }

      if (options.area) {
        query = query.eq("shops.area", options.area);
      }

      return query;
    });

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data || []) as unknown as SupabaseOrderRow[];
    rows.push(...pageRows);

    if (pageRows.length < batchSize) {
      break;
    }
  }

  return rows;
}

export async function readSupabaseOrderListWithShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const rows = await readSupabaseOrderRowsWithShops(supabase, options, false);
  const orders = rows.map(mapOrder);
  const shops = rows.map(getRelatedShop).filter((shop): shop is SupabaseShopRow => Boolean(shop)).map(mapShop);

  return { orders, shops };
}

export async function readSupabaseOrdersWithShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const rows = await readSupabaseOrderRowsWithShops(supabase, options, true);
  const orders = rows.map(mapOrder);
  const shops = rows.map(getRelatedShop).filter((shop): shop is SupabaseShopRow => Boolean(shop)).map(mapShop);

  return { orders, shops };
}

export async function readSupabaseOrderWithShop(
  supabase: SupabaseClient,
  orderId: string,
) {
  const { data, error } = await runSupabaseRead(() =>
    supabase
      .from("orders")
      .select(getOrdersWithShopsSelect({}, true))
      .eq("id", orderId)
      .maybeSingle(),
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data as SupabaseOrderRow | null;
  const shop = row ? getRelatedShop(row) : null;

  return {
    order: row ? mapOrder(row) : null,
    shop: shop ? mapShop(shop) : null,
  };
}

const legacyCollectionsBaseSelect =
  "id, shop_id, sales_person_id, collection_type, bill_date, bill_number, cheque_date, amount, discount, replacement, payment_mode, created_at";

const syncedCollectionsBaseSelect =
  "id, client_group_id, shop_id, sales_person_id, collection_type, status, notes, bill_date, bill_number, cheque_date, amount, discount, replacement, payment_mode, created_at, updated_at";

function getCollectionsSelect(baseSelect: string, options: ScopedReadOptions) {
  return `${baseSelect}, ${
    options.area ? innerShopRelationSelect : shopRelationSelect
  }`;
}

function isMissingCoreSyncColumnError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("client_group_id") ||
    normalizedMessage.includes("collections.status") ||
    normalizedMessage.includes("collections.notes") ||
    normalizedMessage.includes("notes") ||
    normalizedMessage.includes("collections.updated_at")
  );
}

async function readSupabaseCollectionRows(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const pageSize = 1000;
  const rowLimit = options.limit ?? Number.POSITIVE_INFINITY;
  const rows: SupabaseCollectionRow[] = [];

  for (let start = options.offset ?? 0; rows.length < rowLimit; start += pageSize) {
    const batchSize = Math.min(pageSize, rowLimit - rows.length);
    const syncedResponse = await runSupabaseRead(() => {
      let syncedQuery = supabase
        .from("collections")
        .select(getCollectionsSelect(syncedCollectionsBaseSelect, options))
        .order("created_at", { ascending: options.ascending ?? false })
        .range(start, start + batchSize - 1);

      if (options.salesPersonId) {
        syncedQuery = syncedQuery.eq("sales_person_id", options.salesPersonId);
      }

      if (options.createdAtFrom) {
        syncedQuery = syncedQuery.gte("created_at", options.createdAtFrom);
      }

      if (options.createdAtTo) {
        syncedQuery = syncedQuery.lt("created_at", options.createdAtTo);
      }

      if (options.updatedAtFrom) {
        syncedQuery = syncedQuery.gte("updated_at", options.updatedAtFrom);
      }

      if (options.updatedAtTo) {
        syncedQuery = syncedQuery.lt("updated_at", options.updatedAtTo);
      }

      if (options.area) {
        syncedQuery = syncedQuery.eq("shops.area", options.area);
      }

      if (options.paymentMode) {
        syncedQuery = syncedQuery.eq("payment_mode", options.paymentMode);
      }

      return syncedQuery;
    });

    if (syncedResponse.error) {
      if (!isMissingCoreSyncColumnError(syncedResponse.error.message)) {
        throw new Error(syncedResponse.error.message);
      }

      return readLegacySupabaseCollectionRows(supabase, options);
    }

    const pageRows = (syncedResponse.data || []) as unknown as SupabaseCollectionRow[];
    rows.push(...pageRows);

    if (pageRows.length < batchSize) {
      break;
    }
  }

  return rows;
}

async function readLegacySupabaseCollectionRows(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const pageSize = 1000;
  const rowLimit = options.limit ?? Number.POSITIVE_INFINITY;
  const rows: SupabaseCollectionRow[] = [];

  for (let start = options.offset ?? 0; rows.length < rowLimit; start += pageSize) {
    const batchSize = Math.min(pageSize, rowLimit - rows.length);
    const legacyResponse = await runSupabaseRead(() => {
      let legacyQuery = supabase
        .from("collections")
        .select(getCollectionsSelect(legacyCollectionsBaseSelect, options))
        .order("created_at", { ascending: options.ascending ?? false })
        .range(start, start + batchSize - 1);

      if (options.salesPersonId) {
        legacyQuery = legacyQuery.eq("sales_person_id", options.salesPersonId);
      }

      if (options.createdAtFrom) {
        legacyQuery = legacyQuery.gte("created_at", options.createdAtFrom);
      }

      if (options.createdAtTo) {
        legacyQuery = legacyQuery.lt("created_at", options.createdAtTo);
      }

      if (options.updatedAtFrom) {
        legacyQuery = legacyQuery.gte("created_at", options.updatedAtFrom);
      }

      if (options.updatedAtTo) {
        legacyQuery = legacyQuery.lt("created_at", options.updatedAtTo);
      }

      if (options.area) {
        legacyQuery = legacyQuery.eq("shops.area", options.area);
      }

      if (options.paymentMode) {
        legacyQuery = legacyQuery.eq("payment_mode", options.paymentMode);
      }

      return legacyQuery;
    });

    if (legacyResponse.error) {
      throw new Error(legacyResponse.error.message);
    }

    const pageRows = (legacyResponse.data || []) as unknown as SupabaseCollectionRow[];
    rows.push(...pageRows);

    if (pageRows.length < batchSize) {
      break;
    }
  }

  return rows;
}

export async function readSupabaseCollectionsWithShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const rows = await readSupabaseCollectionRows(supabase, options);
  const collections = mapCollections(rows);
  const shops = rows.map(getRelatedShop).filter((shop): shop is SupabaseShopRow => Boolean(shop)).map(mapShop);

  return { collections, shops, rawRowCount: rows.length };
}

export async function readSupabaseCollectionPageWithShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const pageSize = options.limit ?? 100;
  const rows = await readSupabaseCollectionRows(supabase, {
    ...options,
    limit: pageSize + 1,
  });
  const pageRows = rows.slice(0, pageSize);
  const collections = mapCollections(pageRows);
  const shops = pageRows.map(getRelatedShop).filter((shop): shop is SupabaseShopRow => Boolean(shop)).map(mapShop);

  return { collections, shops, rawRowCount: pageRows.length, fetchedRowCount: rows.length };
}

export async function readSupabaseOrderSummary(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const { data, error } = await runSupabaseRead(() =>
    supabase.rpc("get_order_summary_v1", {
      p_created_at_from: options.createdAtFrom || null,
      p_created_at_to: options.createdAtTo || null,
      p_sales_person_id: options.salesPersonId || null,
      p_area: options.area || null,
    }),
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data)
    ? (data[0] as SupabaseOrderSummaryRow | undefined)
    : undefined;

  return {
    total: toNumber(row?.total_count),
    updated: toNumber(row?.updated_count),
    adhoc: toNumber(row?.adhoc_count),
  };
}

export async function readSupabaseCollectionSummary(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const { data, error } = await runSupabaseRead(() =>
    supabase.rpc("get_collection_summary_v1", {
      p_created_at_from: options.createdAtFrom || null,
      p_created_at_to: options.createdAtTo || null,
      p_sales_person_id: options.salesPersonId || null,
      p_area: options.area || null,
      p_payment_mode: options.paymentMode || null,
    }),
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data)
    ? (data[0] as SupabaseCollectionSummaryRow | undefined)
    : undefined;

  return {
    rowCount: toNumber(row?.row_count),
    cash: toNumber(row?.cash_total),
    cheque: toNumber(row?.cheque_total),
    upi: toNumber(row?.upi_total),
    total: toNumber(row?.total_amount),
  };
}

export async function readSupabaseVisitProofsWithShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const pageSize = 1000;
  const rows: SupabaseVisitProofRow[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await runSupabaseRead(() => {
      let query = supabase
        .from("visit_proofs")
        .select(
          "id, order_id, shop_id, sales_person_id, visit_type, latitude, longitude, accuracy, distance_meters, captured_at, shops(id, name, phone, address, area, visit_day, assigned_to, location_lat, location_lng, location_accuracy, location_captured_at)",
        )
        .order("captured_at", { ascending: false })
        .range(start, start + pageSize - 1);

      if (options.salesPersonId) {
        query = query.eq("sales_person_id", options.salesPersonId);
      }

      if (options.capturedAtFrom) {
        query = query.gte("captured_at", options.capturedAtFrom);
      }

      if (options.capturedAtTo) {
        query = query.lt("captured_at", options.capturedAtTo);
      }

      return query;
    });

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data || []) as SupabaseVisitProofRow[];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
  }

  const visits = rows.map(mapVisitProof);
  const shops = rows.map(getRelatedShop).filter((shop): shop is SupabaseShopRow => Boolean(shop)).map(mapShop);

  return { visits, shops };
}

export async function readSupabaseShops(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const pageSize = 1000;
  const rows: SupabaseShopRow[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await runSupabaseRead(() => {
      let query = supabase
        .from("shops")
        .select("id, name, phone, address, area, visit_day, assigned_to, location_lat, location_lng, location_accuracy, location_captured_at")
        .order("area", { ascending: true })
        .order("name", { ascending: true })
        .range(start, start + pageSize - 1);

      if (options.salesPersonId) {
        query = query.eq("assigned_to", options.salesPersonId);
      }

      return query;
    });

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data || []) as SupabaseShopRow[];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
  }

  return rows.map(mapShop);
}

export async function readSupabaseShopAreas(supabase: SupabaseClient) {
  const { data, error } = await runSupabaseRead(() =>
    supabase.rpc("get_shop_area_options_v1"),
  );

  if (error) {
    const fallbackShops = await readSupabaseShops(supabase);
    return Array.from(new Set(fallbackShops.map((shop) => shop.area))).sort();
  }

  return ((data || []) as unknown as SupabaseShopAreaRow[])
    .map((row) => normalizeArea(row.area))
    .filter(Boolean)
    .sort();
}

export async function readSupabaseProductSkus(supabase: SupabaseClient) {
  const { data, error } = await runSupabaseRead(() =>
    supabase
      .from("product_skus")
      .select("id, product_id, sku_size, sku_code, rate, mrp, products(name, category, photo_url)")
      .eq("active", true)
      .order("sku_size", { ascending: true }),
  );

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as SupabaseProductSkuRow[]).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;

    return {
      id: row.id,
      productId: row.product_id,
      productName: product?.name || "Unknown product",
      category: product?.category || null,
      photoUrl: product?.photo_url || null,
      skuSize: row.sku_size,
      skuCode: row.sku_code,
      rate: toNumber(row.rate),
      mrp: toNumber(row.mrp),
    };
  });
}

export async function readSupabaseSalesTargets(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  const { data, error } = await runSupabaseRead(() => {
    let query = supabase
      .from("sales_targets")
      .select("id, sales_person_id, product_id, product_sku_id, product_name, sku_size, sku_code, grams, target_kg, start_date, end_date, created_at, updated_at")
      .order("end_date", { ascending: true })
      .order("product_name", { ascending: true });

    if (options.salesPersonId) {
      query = query.eq("sales_person_id", options.salesPersonId);
    }

    return query;
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as SupabaseTargetRow[]).map(mapTarget);
}

export async function readSupabaseProfiles(supabase: SupabaseClient) {
  const { data, error } = await runSupabaseRead(() =>
    supabase
      .from("profiles")
      .select("id, full_name, role, login_id, active, geofence_meters")
      .order("full_name", { ascending: true }),
  );

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as SupabaseProfileRow[])
    .filter((row) => row.role === "admin" || row.role === "manager" || row.role === "sales")
    .map((row): UserProfile => ({
      id: row.id,
      fullName: row.full_name || "User",
      role: row.role!,
      loginId: row.login_id || "",
      active: row.active === true,
      geofenceMeters: toNullableNumber(row.geofence_meters),
    }));
}

const salesDaySessionLegacySelect =
  "id, sales_person_id, work_date, status, started_at, lunch_started_at, lunch_ended_at, ended_at, created_at, updated_at";

const salesDaySessionGpsSelect =
  "id, sales_person_id, work_date, status, started_at, start_lat, start_lng, start_accuracy, lunch_started_at, lunch_start_lat, lunch_start_lng, lunch_start_accuracy, lunch_ended_at, lunch_end_lat, lunch_end_lng, lunch_end_accuracy, ended_at, end_lat, end_lng, end_accuracy, created_at, updated_at";

function isMissingSalesDayGpsColumnError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("start_lat") ||
    normalizedMessage.includes("start_lng") ||
    normalizedMessage.includes("start_accuracy") ||
    normalizedMessage.includes("lunch_start_lat") ||
    normalizedMessage.includes("lunch_end_lat") ||
    normalizedMessage.includes("end_lat")
  );
}

export async function readSupabaseSalesDaySessions(
  supabase: SupabaseClient,
  options: ScopedReadOptions = {},
) {
  function buildQuery(selectColumns: string) {
    let query = supabase
      .from("sales_day_sessions")
      .select(selectColumns)
      .order("work_date", { ascending: false })
      .order("started_at", { ascending: false });

    if (options.salesPersonId) {
      query = query.eq("sales_person_id", options.salesPersonId);
    }

    if (options.workDate) {
      query = query.eq("work_date", options.workDate);
    }

    if (options.workDateFrom) {
      query = query.gte("work_date", options.workDateFrom);
    }

    if (options.workDateTo) {
      query = query.lte("work_date", options.workDateTo);
    }

    return query;
  }

  let { data, error } = await runSupabaseRead(() => buildQuery(salesDaySessionGpsSelect));

  if (error && isMissingSalesDayGpsColumnError(error.message)) {
    const legacyResponse = await runSupabaseRead(() => buildQuery(salesDaySessionLegacySelect));
    data = legacyResponse.data;
    error = legacyResponse.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as unknown as SupabaseSalesDaySessionRow[]).map(mapSalesDaySession);
}

export async function readSupabaseSalesDaySessionForDate(
  supabase: SupabaseClient,
  salesPersonId: string,
  workDate: string,
) {
  const sessions = await readSupabaseSalesDaySessions(supabase, {
    salesPersonId,
    workDate,
  });

  return sessions[0] || null;
}

export async function readSupabaseAreaRouteSchedules(supabase: SupabaseClient) {
  const { data, error } = await runSupabaseRead(() =>
    supabase
      .from("area_route_schedules")
      .select("id, area, sales_person_id, visit_day, frequency, start_date")
      .order("area", { ascending: true }),
  );

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as SupabaseAreaRouteScheduleRow[]).map(
    (row): AreaRouteSchedule => ({
      id: row.id,
      area: normalizeArea(row.area),
      salesPersonId: row.sales_person_id,
      visitDay: row.visit_day,
      frequency: row.frequency,
      startDate: row.start_date,
    }),
  );
}

export async function readSupabaseRouteOverrides(supabase: SupabaseClient) {
  const { data, error } = await runSupabaseRead(() =>
    supabase
      .from("route_overrides")
      .select("id, sales_person_id, override_date, area")
      .order("override_date", { ascending: false }),
  );

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as SupabaseRouteOverrideRow[]).map(
    (row): RouteOverride => ({
      id: row.id,
      salesPersonId: row.sales_person_id,
      overrideDate: row.override_date,
      area: normalizeArea(row.area),
    }),
  );
}
