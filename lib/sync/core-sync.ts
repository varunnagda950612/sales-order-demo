import { runBrowserStorageMaintenance } from "@/lib/browser/storage-maintenance";
import { areSupabaseWritesEnabled } from "@/lib/config/write-mode";
import { isLocalAppMode } from "@/lib/config/app-mode";
import { getIndiaDate, getUtcRangeForIndiaDate } from "@/lib/dates/india";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  hydrateCoreOutboxFromBackup,
  getCoreMutationActorId,
  readCoreOutbox,
  resetInterruptedCoreMutations,
  resetFailedCoreMutations,
  updateCoreMutation,
  type CoreMutation,
} from "@/lib/sync/core-outbox";
import { assertNewOrderVisitIsSameDay } from "@/lib/sync/order-visit-validation";

type SyncOptions = {
  includeFailed?: boolean;
};

let activeSync: Promise<void> | null = null;
let syncScheduled = false;
const coreRequestTimeoutMs = 25_000;

type SupabaseRpcError = {
  message: string;
  code?: string;
  status?: number;
};

class CoreSyncRequestError extends Error {
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { code?: string; status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "CoreSyncRequestError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable || false;
  }
}

function canSyncNow() {
  return (
    typeof window !== "undefined" &&
    !isLocalAppMode() &&
    areSupabaseWritesEnabled() &&
    navigator.onLine
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown sync failure.";
}

function isRetryableFailure(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  if (error instanceof CoreSyncRequestError) {
    if (error.retryable || error.status === 429 || (error.status || 0) >= 500) {
      return true;
    }
  }

  const message = getErrorMessage(error).toLowerCase();
  return [
    "failed to fetch",
    "network",
    "timeout",
    "timed out",
    "gateway timeout",
    "bad gateway",
    "service unavailable",
    "temporarily unavailable",
    "internal server error",
    "jwt expired",
    "missing authorization",
    "authentication is required",
  ].some((value) => message.includes(value));
}

function getRetryDelay(attempts: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

function toCoreSyncError(error: SupabaseRpcError) {
  return new CoreSyncRequestError(error.message, {
    code: error.code,
    status: error.status,
  });
}

function withRequestTimeout<T>(request: PromiseLike<T>) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(
        new CoreSyncRequestError(
          "Supabase did not respond before the protected sync timeout.",
          { retryable: true },
        ),
      );
    }, coreRequestTimeoutMs);

    Promise.resolve(request).then(
      (result) => {
        window.clearTimeout(timeoutId);
        resolve(result);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function assertNoSameDayOrderExists(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  order: Extract<CoreMutation, { kind: "order" }>["payload"]["order"],
) {
  if (order.status !== "placed") {
    return;
  }

  const { start, end } = getUtcRangeForIndiaDate(getIndiaDate(new Date(order.createdAt)));
  const { data, error } = await withRequestTimeout(
    supabase
      .from("orders")
      .select("id")
      .eq("shop_id", order.shopId)
      .eq("sales_person_id", order.salesPersonId)
      .neq("id", order.id)
      .neq("status", "cancelled")
      .gte("created_at", start)
      .lt("created_at", end)
      .limit(1),
  );

  if (error) {
    throw toCoreSyncError(error);
  }

  if (data?.length) {
    throw new Error(
      "This shop already has an order for this salesperson today. Edit the existing order instead of creating another one.",
    );
  }
}

async function getAuthenticatedActorId() {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await withRequestTimeout(supabase.auth.getUser());

    if (error || !data.user) {
      return null;
    }

    return data.user.id;
  } catch {
    return null;
  }
}

async function syncMutation(mutation: CoreMutation) {
  const supabase = createSupabaseBrowserClient();

  if (mutation.kind === "visit") {
    const visit = mutation.payload.visit;
    const { error } = await withRequestTimeout(
      supabase.rpc("sync_visit_proof_v2", {
        p_visit: {
          client_event_id: visit.id,
          shop_id: visit.shopId,
          order_id: visit.orderId,
          sales_person_id: visit.salesPersonId,
          visit_type: visit.visitType,
          latitude: visit.latitude,
          longitude: visit.longitude,
          accuracy: visit.accuracy,
          distance_meters: visit.distanceMeters,
          captured_at: visit.capturedAt,
          save_shop_anchor: visit.saveShopAnchor,
        },
      }),
    );

    if (error) {
      throw toCoreSyncError(error);
    }

    return;
  }

  if (mutation.kind === "order") {
    const { order, orderStartedVisit } = mutation.payload;

    assertNewOrderVisitIsSameDay(order);
    await assertNoSameDayOrderExists(supabase, order);

    const { error } = await withRequestTimeout(
      supabase.rpc("save_order_with_items_v2", {
        p_order: {
          client_mutation_id: mutation.id,
          id: order.id,
          shop_id: order.shopId,
          sales_person_id: order.salesPersonId,
          order_type: order.orderType,
          status: order.status,
          notes: order.notes,
          replacement_notes: order.replacementNotes,
          subtotal: order.subtotal,
          gst_rate: order.gstRate,
          gst_amount: order.gstAmount,
          grand_total: order.grandTotal,
          visit_lat: order.visitLat,
          visit_lng: order.visitLng,
          visit_accuracy: order.visitAccuracy,
          visit_captured_at: order.visitCapturedAt,
          created_at: order.createdAt,
          client_updated_at: order.updatedAt,
          order_started_visit: orderStartedVisit
            ? {
                client_event_id: orderStartedVisit.id,
                shop_id: orderStartedVisit.shopId,
                sales_person_id: orderStartedVisit.salesPersonId,
                latitude: orderStartedVisit.latitude,
                longitude: orderStartedVisit.longitude,
                accuracy: orderStartedVisit.accuracy,
                distance_meters: orderStartedVisit.distanceMeters,
                captured_at: orderStartedVisit.capturedAt,
                save_shop_anchor: orderStartedVisit.saveShopAnchor,
              }
            : null,
        },
        p_items: order.items.map((item) => ({
          product_id: item.productId,
          product_sku_id: item.skuId,
          product_name: item.productName,
          sku_size: item.skuSize,
          sku_code: item.skuCode,
          rate: item.rate,
          mrp: item.mrp,
          quantity: item.quantity,
        })),
      }),
    );

    if (error) {
      throw toCoreSyncError(error);
    }

    return;
  }

  const { collection } = mutation.payload;
  const { error } = await withRequestTimeout(
    supabase.rpc("save_collection_group_v2", {
      p_collection: {
        client_mutation_id: mutation.id,
        id: collection.id,
        shop_id: collection.shopId,
        sales_person_id: collection.salesPersonId,
        collection_type: collection.collectionType,
        status: collection.status,
        created_at: collection.createdAt,
        client_updated_at: collection.updatedAt,
      },
      p_bills: collection.bills.map((bill) => ({
        id: bill.id,
        bill_date: bill.billDate,
        bill_number: bill.billNumber,
        notes: bill.notes,
        cheque_date: bill.chequeDate,
        amount: bill.amount,
        discount: bill.discount,
        replacement: bill.replacement,
        payment_mode: bill.paymentMode,
      })),
    }),
  );

  if (error) {
    throw toCoreSyncError(error);
  }
}

async function runCoreSync(options: SyncOptions) {
  if (!canSyncNow()) {
    return;
  }

  await hydrateCoreOutboxFromBackup();
  const activeActorId = await getAuthenticatedActorId();

  if (!activeActorId) {
    return;
  }

  resetInterruptedCoreMutations(activeActorId);

  const now = Date.now();
  const mutations = readCoreOutbox().filter((mutation) => {
    if (getCoreMutationActorId(mutation) !== activeActorId) {
      return false;
    }

    if (mutation.status === "failed" && !options.includeFailed) {
      return false;
    }

    if (mutation.status !== "pending" && mutation.status !== "failed") {
      return false;
    }

    return !mutation.nextAttemptAt || new Date(mutation.nextAttemptAt).getTime() <= now;
  });

  for (const mutation of mutations) {
    updateCoreMutation(mutation.id, { status: "syncing", lastError: null, nextAttemptAt: null });

    try {
      await syncMutation(mutation);
      updateCoreMutation(mutation.id, {
        status: "synced",
        lastError: null,
        nextAttemptAt: null,
      });
    } catch (error) {
      const attempts = mutation.attempts + 1;
      const message = getErrorMessage(error);

      if (isRetryableFailure(error)) {
        const retryDelay = getRetryDelay(attempts);
        updateCoreMutation(mutation.id, {
          status: "pending",
          attempts,
          lastError: "Connection unavailable. The record remains protected and will retry automatically.",
          nextAttemptAt: new Date(Date.now() + retryDelay).toISOString(),
        });

        window.setTimeout(() => requestCoreSync(), retryDelay);
      } else {
        updateCoreMutation(mutation.id, {
          status: "failed",
          attempts,
          lastError: message,
          nextAttemptAt: null,
        });
      }
    }
  }

  runBrowserStorageMaintenance({ level: "normal", reason: "sync-complete" });
}

export function syncPendingCoreMutations(options: SyncOptions = {}) {
  if (activeSync) {
    return activeSync;
  }

  activeSync = runCoreSync(options).finally(() => {
    activeSync = null;
  });

  return activeSync;
}

export function requestCoreSync() {
  if (!canSyncNow() || syncScheduled) {
    return;
  }

  syncScheduled = true;
  window.setTimeout(() => {
    syncScheduled = false;
    void syncPendingCoreMutations();
  }, 0);
}

export async function retryFailedCoreMutations() {
  const activeActorId = await getAuthenticatedActorId();

  if (!activeActorId) {
    return;
  }

  resetFailedCoreMutations(activeActorId);
  await syncPendingCoreMutations({ includeFailed: true });
}
