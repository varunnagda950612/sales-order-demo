import { areSupabaseWritesEnabled } from "@/lib/config/write-mode";
import { isLocalAppMode } from "@/lib/config/app-mode";
import {
  createLocalVisitRecord,
  type LocalVisitRecord,
  writeLocalVisit,
} from "@/lib/local/visit-proofs";
import {
  deleteLocalCollection,
  writeLocalCollection,
} from "@/lib/local/collections";
import {
  deleteLocalOrder,
  writeLocalOrder,
} from "@/lib/local/orders";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createCoreMutationId,
  enqueueCoreMutation,
  removeCoreCollectionMutations,
  removeCoreOrderMutations,
  type CoreCollectionMutation,
  type CoreOrderMutation,
  type CoreVisitMutation,
} from "@/lib/sync/core-outbox";
import { assertNewOrderVisitIsSameDay } from "@/lib/sync/order-visit-validation";
import { requestCoreSync } from "@/lib/sync/core-sync";
import type { LocalCollection, LocalOrder } from "@/types/domain";

export type CoreCommitResult = {
  syncQueued: boolean;
  recoveryWarning: string | null;
};

function getNewMutationFields(entityKey: string, actorId: string | null) {
  const now = new Date().toISOString();

  return {
    id: createCoreMutationId(),
    entityKey,
    actorId,
    status: "pending" as const,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: null,
    lastError: null,
  };
}

function shouldQueueForSupabase() {
  return !isLocalAppMode();
}

function writeCanonicalRecord(writeRecord: () => void) {
  try {
    writeRecord();
    return null;
  } catch {
    return "This record is protected in the recovery queue, but the normal local view could not be updated. Refresh before entering another record.";
  }
}

function scheduleSync(syncQueued: boolean) {
  if (syncQueued && areSupabaseWritesEnabled()) {
    requestCoreSync();
  }
}

function makeOrderStartedVisit(
  order: LocalOrder,
  options: { saveShopAnchor?: boolean; distanceMeters?: number | null } = {},
): LocalVisitRecord {
  if (
    order.visitLat === null ||
    order.visitLng === null ||
    order.visitAccuracy === null ||
    !order.visitCapturedAt
  ) {
    throw new Error("Route orders require a saved GPS visit before they can be protected for sync.");
  }

  assertNewOrderVisitIsSameDay(order);

  return createLocalVisitRecord({
    shopId: order.shopId,
    orderId: order.id,
    salesPersonId: order.salesPersonId,
    visitType: "order_started",
    latitude: order.visitLat,
    longitude: order.visitLng,
    accuracy: order.visitAccuracy,
    distanceMeters: options.distanceMeters ?? null,
    capturedAt: order.visitCapturedAt,
    saveShopAnchor: Boolean(options.saveShopAnchor),
  });
}

export function commitCoreVisit(
  visit: LocalVisitRecord,
  actorId = visit.salesPersonId,
): CoreCommitResult {
  const syncQueued = shouldQueueForSupabase();

  if (syncQueued) {
    const mutation: CoreVisitMutation = {
      ...getNewMutationFields(`visit:${visit.id}`, actorId),
      kind: "visit",
      payload: { visit },
    };
    enqueueCoreMutation(mutation);
    scheduleSync(syncQueued);
    return { syncQueued, recoveryWarning: null };
  }

  const recoveryWarning = writeCanonicalRecord(() => writeLocalVisit(visit));

  return { syncQueued, recoveryWarning };
}

export function commitCoreOrder(
  order: LocalOrder,
  options: {
    createRouteVisitProof: boolean;
    actorId?: string;
    saveShopAnchor?: boolean;
    distanceMeters?: number | null;
  },
): CoreCommitResult {
  const orderStartedVisit = options.createRouteVisitProof
    ? makeOrderStartedVisit(order, {
        saveShopAnchor: options.saveShopAnchor,
        distanceMeters: options.distanceMeters,
      })
    : null;
  const syncQueued = shouldQueueForSupabase();

  if (syncQueued) {
    const mutation: CoreOrderMutation = {
      ...getNewMutationFields(`order:${order.id}`, options.actorId || order.salesPersonId),
      kind: "order",
      payload: { order, orderStartedVisit },
    };
    enqueueCoreMutation(mutation);
    scheduleSync(syncQueued);
    return { syncQueued, recoveryWarning: null };
  }

  const recoveryWarning = writeCanonicalRecord(() => {
    writeLocalOrder(order);

    if (orderStartedVisit) {
      writeLocalVisit(orderStartedVisit);
    }
  });

  return { syncQueued, recoveryWarning };
}

export function commitCoreCollection(
  collection: LocalCollection,
  actorId = collection.salesPersonId,
): CoreCommitResult {
  const syncQueued = shouldQueueForSupabase();

  if (syncQueued) {
    const mutation: CoreCollectionMutation = {
      ...getNewMutationFields(`collection:${collection.id}`, actorId),
      kind: "collection",
      payload: { collection },
    };
    enqueueCoreMutation(mutation);
    scheduleSync(syncQueued);
    return { syncQueued, recoveryWarning: null };
  }

  const recoveryWarning = writeCanonicalRecord(() => writeLocalCollection(collection));

  return { syncQueued, recoveryWarning };
}

function clearOrderFromThisDevice(orderId: string) {
  try {
    removeCoreOrderMutations(orderId);
  } catch {
    // The database tombstone prevents a stale queued save from recreating the order.
  }

  try {
    deleteLocalOrder(orderId);
  } catch {
    // Server and realtime state remain authoritative if local storage is unavailable.
  }
}

export async function deleteCoreOrderPermanently(orderId: string) {
  if (isLocalAppMode()) {
    clearOrderFromThisDevice(orderId);
    return;
  }

  if (!areSupabaseWritesEnabled()) {
    throw new Error("Database writes are disabled.");
  }

  const supabase = createSupabaseBrowserClient();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25_000);

  try {
    const { error } = await supabase
      .rpc("delete_order_v2", { p_order_id: orderId })
      .abortSignal(controller.signal);

    if (error) {
      throw new Error(error.message);
    }

    clearOrderFromThisDevice(orderId);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "The delete request timed out. Refresh the Orders page before retrying because Supabase may still have completed it.",
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function clearCollectionFromThisDevice(collectionId: string) {
  try {
    removeCoreCollectionMutations(collectionId);
  } catch {
    // The database tombstone prevents a stale queued save from recreating the collection.
  }

  try {
    deleteLocalCollection(collectionId);
  } catch {
    // Server and realtime state remain authoritative if local storage is unavailable.
  }
}

export async function deleteCoreCollectionPermanently(
  collection: Pick<LocalCollection, "id">,
) {
  if (isLocalAppMode()) {
    clearCollectionFromThisDevice(collection.id);
    return;
  }

  if (!areSupabaseWritesEnabled()) {
    throw new Error("Database writes are disabled.");
  }

  const supabase = createSupabaseBrowserClient();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25_000);

  try {
    const { error } = await supabase
      .rpc("delete_collection_group_v2", { p_collection_id: collection.id })
      .abortSignal(controller.signal);

    if (!error) {
      clearCollectionFromThisDevice(collection.id);
      return;
    }

    if (controller.signal.aborted) {
      throw new Error(
        "The delete request timed out. Refresh the Collections page before retrying because Supabase may still have completed it.",
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
