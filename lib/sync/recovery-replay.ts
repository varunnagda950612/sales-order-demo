import type { SupabaseClient } from "@supabase/supabase-js";

type SnapshotRecord = Record<string, unknown>;

type RecoveryMutationMeta = {
  id: string;
  kind: string;
  entityKey: string;
};

type RecoverySnapshotArrays = {
  mutations: RecoveryMutationMeta[];
  orders: SnapshotRecord[];
  collections: SnapshotRecord[];
  visitProofs: SnapshotRecord[];
};

export type RecoveryReplayResult = {
  recoveredCount: number;
  failedCount: number;
  orders: { recovered: number; failed: number };
  collections: { recovered: number; failed: number };
  visitProofs: { recovered: number; failed: number };
  errors: string[];
};

function isRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getString(record: SnapshotRecord, key: string) {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(record: SnapshotRecord, key: string) {
  const value = getString(record, key);

  return value || null;
}

function getNumber(record: SnapshotRecord, key: string) {
  const value = Number(record[key]);

  return Number.isFinite(value) ? value : 0;
}

function getOptionalNumber(record: SnapshotRecord, key: string) {
  const value = record[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getBoolean(record: SnapshotRecord, key: string) {
  return record[key] === true;
}

function requireString(record: SnapshotRecord, key: string, label: string) {
  const value = getString(record, key);

  if (!value) {
    throw new Error(`${label} is missing ${key}.`);
  }

  return value;
}

function getSnapshotArrays(snapshot: unknown): RecoverySnapshotArrays {
  const empty = {
    mutations: [],
    orders: [],
    collections: [],
    visitProofs: [],
  };

  if (!isRecord(snapshot)) {
    return empty;
  }

  const pending = snapshot.pending;

  if (!isRecord(pending)) {
    return empty;
  }

  const mutationSource = asArray(pending.mutations).length
    ? asArray(pending.mutations)
    : asArray(pending.outbox);

  return {
    mutations: mutationSource.filter(isRecord).flatMap((mutation) => {
      const id = getString(mutation, "id");
      const kind = getString(mutation, "kind");
      const entityKey = getString(mutation, "entityKey");

      return id && kind && entityKey ? [{ id, kind, entityKey }] : [];
    }),
    orders: asArray(pending.orders).filter(isRecord),
    collections: asArray(pending.collections).filter(isRecord),
    visitProofs: asArray(pending.visitProofs).filter(isRecord),
  };
}

function findMutationId(
  mutations: RecoveryMutationMeta[],
  kind: string,
  entityId: string,
) {
  return (
    mutations.find(
      (mutation) =>
        mutation.kind === kind && mutation.entityKey === `${kind}:${entityId}`,
    )?.id || entityId
  );
}

function toVisitRpc(visit: SnapshotRecord) {
  return {
    client_event_id: requireString(visit, "id", "Visit proof"),
    shop_id: requireString(visit, "shopId", "Visit proof"),
    order_id: getOptionalString(visit, "orderId"),
    sales_person_id: requireString(visit, "salesPersonId", "Visit proof"),
    visit_type: getString(visit, "visitType") || "check_in",
    latitude: getOptionalNumber(visit, "latitude"),
    longitude: getOptionalNumber(visit, "longitude"),
    accuracy: getOptionalNumber(visit, "accuracy"),
    distance_meters: getOptionalNumber(visit, "distanceMeters"),
    captured_at: requireString(visit, "capturedAt", "Visit proof"),
    save_shop_anchor: getBoolean(visit, "saveShopAnchor"),
  };
}

function findOrderStartedVisit(order: SnapshotRecord, visitProofs: SnapshotRecord[]) {
  const orderId = getString(order, "id");

  return (
    visitProofs.find(
      (visit) =>
        getString(visit, "visitType") === "order_started" &&
        getString(visit, "orderId") === orderId,
    ) || null
  );
}

function toOrderRpc(
  order: SnapshotRecord,
  mutationId: string,
  orderStartedVisit: SnapshotRecord | null,
) {
  return {
    client_mutation_id: mutationId,
    id: requireString(order, "id", "Order"),
    shop_id: requireString(order, "shopId", "Order"),
    sales_person_id: requireString(order, "salesPersonId", "Order"),
    order_type: getString(order, "orderType") || "route",
    status: getString(order, "status") || "placed",
    notes: getString(order, "notes"),
    replacement_notes: getString(order, "replacementNotes"),
    subtotal: getNumber(order, "subtotal"),
    gst_rate: getOptionalNumber(order, "gstRate") ?? 0.05,
    gst_amount: getNumber(order, "gstAmount"),
    grand_total: getNumber(order, "grandTotal"),
    visit_lat: getOptionalNumber(order, "visitLat"),
    visit_lng: getOptionalNumber(order, "visitLng"),
    visit_accuracy: getOptionalNumber(order, "visitAccuracy"),
    visit_captured_at: getOptionalString(order, "visitCapturedAt"),
    created_at: requireString(order, "createdAt", "Order"),
    client_updated_at: getString(order, "updatedAt") || getString(order, "createdAt"),
    order_started_visit: orderStartedVisit ? toVisitRpc(orderStartedVisit) : null,
  };
}

function toOrderItemsRpc(order: SnapshotRecord) {
  return asArray(order.items).filter(isRecord).map((item) => ({
    product_id: getOptionalString(item, "productId"),
    product_sku_id: getOptionalString(item, "skuId"),
    product_name: requireString(item, "productName", "Order item"),
    sku_size: getString(item, "skuSize"),
    sku_code: getOptionalString(item, "skuCode"),
    rate: getNumber(item, "rate"),
    mrp: getNumber(item, "mrp"),
    quantity: getNumber(item, "quantity"),
  }));
}

function toCollectionRpc(collection: SnapshotRecord, mutationId: string) {
  return {
    client_mutation_id: mutationId,
    id: requireString(collection, "id", "Collection"),
    shop_id: requireString(collection, "shopId", "Collection"),
    sales_person_id: requireString(collection, "salesPersonId", "Collection"),
    collection_type: getString(collection, "collectionType") || "route",
    status: getString(collection, "status") || "placed",
    created_at: requireString(collection, "createdAt", "Collection"),
    client_updated_at:
      getString(collection, "updatedAt") || getString(collection, "createdAt"),
  };
}

function toCollectionBillsRpc(collection: SnapshotRecord) {
  return asArray(collection.bills).filter(isRecord).map((bill) => ({
    id: requireString(bill, "id", "Collection bill"),
    bill_date: requireString(bill, "billDate", "Collection bill"),
    bill_number: getString(bill, "billNumber"),
    notes: getString(bill, "notes"),
    cheque_date: getOptionalString(bill, "chequeDate"),
    amount: getNumber(bill, "amount"),
    discount: getNumber(bill, "discount"),
    replacement: getNumber(bill, "replacement"),
    payment_mode: getString(bill, "paymentMode") || "cash",
  }));
}

function getReplayErrorLabel(kind: string, payload: SnapshotRecord) {
  return `${kind} ${getString(payload, "id") || getString(payload, "shopId") || "unknown"}`;
}

function emptyResult(): RecoveryReplayResult {
  return {
    recoveredCount: 0,
    failedCount: 0,
    orders: { recovered: 0, failed: 0 },
    collections: { recovered: 0, failed: 0 },
    visitProofs: { recovered: 0, failed: 0 },
    errors: [],
  };
}

function addFailure(
  result: RecoveryReplayResult,
  bucket: keyof Pick<RecoveryReplayResult, "orders" | "collections" | "visitProofs">,
  label: string,
  error: unknown,
) {
  result.failedCount += 1;
  result[bucket].failed += 1;
  result.errors.push(
    `${label}: ${error instanceof Error ? error.message : "Unknown replay failure."}`,
  );
}

async function replayOrder(
  supabase: SupabaseClient,
  order: SnapshotRecord,
  mutations: RecoveryMutationMeta[],
  visitProofs: SnapshotRecord[],
) {
  const orderId = requireString(order, "id", "Order");
  const pOrder = toOrderRpc(
    order,
    findMutationId(mutations, "order", orderId),
    findOrderStartedVisit(order, visitProofs),
  );
  const pItems = toOrderItemsRpc(order);

  const { error } = await supabase.rpc("save_order_with_items_v2", {
    p_order: pOrder,
    p_items: pItems,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function replayCollection(
  supabase: SupabaseClient,
  collection: SnapshotRecord,
  mutations: RecoveryMutationMeta[],
) {
  const collectionId = requireString(collection, "id", "Collection");
  const { error } = await supabase.rpc("save_collection_group_v2", {
    p_collection: toCollectionRpc(
      collection,
      findMutationId(mutations, "collection", collectionId),
    ),
    p_bills: toCollectionBillsRpc(collection),
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function replayVisitProof(supabase: SupabaseClient, visit: SnapshotRecord) {
  const { error } = await supabase.rpc("sync_visit_proof_v2", {
    p_visit: toVisitRpc(visit),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function replayRecoverySnapshot(
  supabase: SupabaseClient,
  snapshot: unknown,
) {
  const result = emptyResult();
  const { mutations, orders, collections, visitProofs } = getSnapshotArrays(snapshot);

  for (const order of orders) {
    try {
      await replayOrder(supabase, order, mutations, visitProofs);
      result.recoveredCount += 1;
      result.orders.recovered += 1;
    } catch (error) {
      addFailure(result, "orders", getReplayErrorLabel("Order", order), error);
    }
  }

  for (const collection of collections) {
    try {
      await replayCollection(supabase, collection, mutations);
      result.recoveredCount += 1;
      result.collections.recovered += 1;
    } catch (error) {
      addFailure(
        result,
        "collections",
        getReplayErrorLabel("Collection", collection),
        error,
      );
    }
  }

  for (const visit of visitProofs) {
    try {
      await replayVisitProof(supabase, visit);
      result.recoveredCount += 1;
      result.visitProofs.recovered += 1;
    } catch (error) {
      addFailure(
        result,
        "visitProofs",
        getReplayErrorLabel("Visit proof", visit),
        error,
      );
    }
  }

  return result;
}
