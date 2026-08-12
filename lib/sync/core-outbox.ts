import {
  pruneStaleSyncedCoreMutations,
  setLocalStorageJsonWithMaintenance,
} from "@/lib/browser/storage-maintenance";
import { coreOutboxStorageKey } from "@/lib/browser/storage-keys";
import type { LocalCollection, LocalOrder } from "@/types/domain";
import type { LocalVisitRecord } from "@/lib/local/visit-proofs";

export type CoreMutationStatus = "pending" | "syncing" | "failed" | "synced";

type CoreMutationBase = {
  id: string;
  entityKey: string;
  actorId: string | null;
  status: CoreMutationStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  lastError: string | null;
};

export type CoreOrderMutation = CoreMutationBase & {
  kind: "order";
  payload: {
    order: LocalOrder;
    orderStartedVisit: LocalVisitRecord | null;
  };
};

export type CoreVisitMutation = CoreMutationBase & {
  kind: "visit";
  payload: {
    visit: LocalVisitRecord;
  };
};

export type CoreCollectionMutation = CoreMutationBase & {
  kind: "collection";
  payload: {
    collection: LocalCollection;
  };
};

export type CoreMutation = CoreOrderMutation | CoreVisitMutation | CoreCollectionMutation;

export type CoreSyncSummary = {
  pending: number;
  syncing: number;
  failed: number;
  latestError: string | null;
};

type CoreOutboxBackup = {
  key: "outbox";
  mutations: CoreMutation[];
};

export { coreOutboxStorageKey };
export const coreOutboxChangedEvent = "manish-masala-next.core-outbox-changed";

const backupDatabaseName = "manish-masala-next-core-outbox";
const backupStoreName = "outbox";
const interruptedSyncingAgeMs = 5 * 60 * 1000;
let mirrorOutboxWriteChain = Promise.resolve();

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function sortMutations(mutations: CoreMutation[]) {
  return [...mutations].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function emitOutboxChange() {
  if (canUseBrowserStorage()) {
    window.dispatchEvent(new Event(coreOutboxChangedEvent));
  }
}

function openBackupDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(backupDatabaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(backupStoreName)) {
        database.createObjectStore(backupStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open the recovery backup."));
  });
}

async function mirrorOutboxToIndexedDb(mutations: CoreMutation[]) {
  if (!canUseBrowserStorage() || !("indexedDB" in window)) {
    return;
  }

  try {
    const database = await openBackupDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(backupStoreName, "readwrite");
      transaction.objectStore(backupStoreName).put({ key: "outbox", mutations } satisfies CoreOutboxBackup);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to mirror the recovery queue."));
      transaction.onabort = () => reject(transaction.error || new Error("Unable to mirror the recovery queue."));
    });

    database.close();
  } catch {
    // localStorage remains the primary synchronous write-ahead store.
  }
}

function queueOutboxMirrorToIndexedDb(mutations: CoreMutation[]) {
  const mutationsSnapshot = [...mutations];

  mirrorOutboxWriteChain = mirrorOutboxWriteChain
    .catch(() => undefined)
    .then(() => mirrorOutboxToIndexedDb(mutationsSnapshot));

  void mirrorOutboxWriteChain;
}

async function readOutboxFromIndexedDb() {
  if (!canUseBrowserStorage() || !("indexedDB" in window)) {
    return [];
  }

  try {
    const database = await openBackupDatabase();
    const backup = await new Promise<CoreOutboxBackup | undefined>((resolve, reject) => {
      const transaction = database.transaction(backupStoreName, "readonly");
      const request = transaction.objectStore(backupStoreName).get("outbox");
      request.onsuccess = () => resolve(request.result as CoreOutboxBackup | undefined);
      request.onerror = () => reject(request.error || new Error("Unable to read the recovery backup."));
    });

    database.close();
    return Array.isArray(backup?.mutations) ? backup.mutations : [];
  } catch {
    return [];
  }
}

function mergeMutations(current: CoreMutation[], backup: CoreMutation[]) {
  const mutationById = new Map<string, CoreMutation>();

  [...current, ...backup].forEach((mutation) => {
    const existingMutation = mutationById.get(mutation.id);

    if (
      !existingMutation ||
      new Date(mutation.updatedAt).getTime() >= new Date(existingMutation.updatedAt).getTime()
    ) {
      mutationById.set(mutation.id, mutation);
    }
  });

  return sortMutations(Array.from(mutationById.values()));
}

function isInterruptedSyncingMutation(
  mutation: CoreMutation,
  now = Date.now(),
  maxAgeMs = interruptedSyncingAgeMs,
) {
  if (mutation.status !== "syncing") {
    return false;
  }

  const updatedAtTime = new Date(mutation.updatedAt).getTime();

  return Number.isNaN(updatedAtTime) || now - updatedAtTime > maxAgeMs;
}

function resetInterruptedSyncingMutations(
  mutations: CoreMutation[],
  actorId?: string,
  maxAgeMs = interruptedSyncingAgeMs,
) {
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  let resetCount = 0;
  const nextMutations = mutations.map((mutation) => {
    if (
      isInterruptedSyncingMutation(mutation, now, maxAgeMs) &&
      (!actorId || getCoreMutationActorId(mutation) === actorId)
    ) {
      resetCount += 1;
      return {
        ...mutation,
        status: "pending" as const,
        nextAttemptAt: null,
        lastError: null,
        updatedAt,
      } as CoreMutation;
    }

    return mutation;
  });

  return { mutations: nextMutations, resetCount };
}

export function createCoreMutationId() {
  return makeId();
}

export function getCoreMutationActorId(mutation: CoreMutation) {
  if (typeof mutation.actorId === "string" && mutation.actorId) {
    return mutation.actorId;
  }

  if (mutation.kind === "order") {
    return mutation.payload.order.salesPersonId;
  }

  if (mutation.kind === "visit") {
    return mutation.payload.visit.salesPersonId;
  }

  return mutation.payload.collection.salesPersonId;
}

export function readCoreOutbox(): CoreMutation[] {
  if (!canUseBrowserStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(coreOutboxStorageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? sortMutations(parsedValue as CoreMutation[]) : [];
  } catch {
    return [];
  }
}

export function writeCoreOutbox(mutations: CoreMutation[]) {
  if (!canUseBrowserStorage()) {
    return;
  }

  const nextMutations = sortMutations(pruneStaleSyncedCoreMutations(mutations));

  try {
    setLocalStorageJsonWithMaintenance(coreOutboxStorageKey, nextMutations);
  } catch {
    throw new Error(
      "This device cannot store the protected recovery queue. Free browser storage before saving orders, visits, or collections.",
    );
  }

  queueOutboxMirrorToIndexedDb(nextMutations);
  emitOutboxChange();
}

export async function waitForCoreOutboxBackupMirror() {
  await mirrorOutboxWriteChain.catch(() => undefined);
}

export function enqueueCoreMutation(mutation: CoreMutation) {
  const outbox = readCoreOutbox();
  const coalescedIndex = outbox.findIndex(
    (existingMutation) =>
      existingMutation.entityKey === mutation.entityKey &&
      (existingMutation.status === "pending" || existingMutation.status === "failed"),
  );

  if (coalescedIndex >= 0) {
    const existingMutation = outbox[coalescedIndex];
    const replacement = {
      ...mutation,
      id: existingMutation.id,
      createdAt: existingMutation.createdAt,
      attempts: existingMutation.attempts,
      status: "pending" as const,
      updatedAt: new Date().toISOString(),
      nextAttemptAt: null,
      lastError: null,
    } as CoreMutation;

    outbox[coalescedIndex] = replacement;
    writeCoreOutbox(outbox);
    return replacement;
  }

  writeCoreOutbox([...outbox, mutation]);
  return mutation;
}

export function removeCoreOrderMutations(orderId: string) {
  writeCoreOutbox(
    readCoreOutbox().filter(
      (mutation) =>
        mutation.kind !== "order" || mutation.payload.order.id !== orderId,
    ),
  );
}

export function removeCoreCollectionMutations(collectionId: string) {
  writeCoreOutbox(
    readCoreOutbox().filter(
      (mutation) =>
        mutation.kind !== "collection" ||
        mutation.payload.collection.id !== collectionId,
    ),
  );
}

export function updateCoreMutation(
  mutationId: string,
  update: Partial<Pick<CoreMutation, "status" | "attempts" | "nextAttemptAt" | "lastError">>,
) {
  const outbox = readCoreOutbox();
  const mutationIndex = outbox.findIndex((mutation) => mutation.id === mutationId);

  if (mutationIndex < 0) {
    return;
  }

  outbox[mutationIndex] = {
    ...outbox[mutationIndex],
    ...update,
    updatedAt: new Date().toISOString(),
  } as CoreMutation;
  writeCoreOutbox(outbox);
}

export function getCoreSyncSummary(actorId?: string) {
  const mutations = actorId
    ? readCoreOutbox().filter((mutation) => getCoreMutationActorId(mutation) === actorId)
    : readCoreOutbox();
  const latestErrorMutation = [...mutations]
    .reverse()
    .find(
      (mutation) =>
        (mutation.status === "failed" || mutation.status === "pending") && mutation.lastError,
    );

  return mutations.reduce<CoreSyncSummary>(
    (summary, mutation) => ({
      ...summary,
      pending: summary.pending + (mutation.status === "pending" ? 1 : 0),
      syncing: summary.syncing + (mutation.status === "syncing" ? 1 : 0),
      failed: summary.failed + (mutation.status === "failed" ? 1 : 0),
    }),
    {
      pending: 0,
      syncing: 0,
      failed: 0,
      latestError: latestErrorMutation?.lastError || null,
    },
  );
}

function isDuplicateSameDayOrderFailure(mutation: CoreMutation) {
  return (
    mutation.kind === "order" &&
    mutation.status === "failed" &&
    mutation.lastError
      ?.toLowerCase()
      .includes("this shop already has an order for this salesperson today")
  );
}

export function getDiscardableDuplicateOrderFailureCount(actorId?: string) {
  return readCoreOutbox().filter(
    (mutation) =>
      isDuplicateSameDayOrderFailure(mutation) &&
      (!actorId || getCoreMutationActorId(mutation) === actorId),
  ).length;
}

export function discardReviewedDuplicateOrderFailures(actorId?: string) {
  let discardedCount = 0;
  const nextMutations = readCoreOutbox().filter((mutation) => {
    const shouldDiscard =
      isDuplicateSameDayOrderFailure(mutation) &&
      (!actorId || getCoreMutationActorId(mutation) === actorId);

    if (shouldDiscard) {
      discardedCount += 1;
      return false;
    }

    return true;
  });

  if (discardedCount > 0) {
    writeCoreOutbox(nextMutations);
  }

  return discardedCount;
}

export function getInterruptedCoreMutationCount(actorId?: string) {
  const now = Date.now();

  return readCoreOutbox().filter(
    (mutation) =>
      isInterruptedSyncingMutation(mutation, now) &&
      (!actorId || getCoreMutationActorId(mutation) === actorId),
  ).length;
}

export function resetInterruptedCoreMutations(actorId?: string) {
  const { mutations, resetCount } = resetInterruptedSyncingMutations(
    readCoreOutbox(),
    actorId,
  );

  if (resetCount > 0) {
    writeCoreOutbox(mutations);
  }

  return resetCount;
}

export function discardReviewedProtectedCoreMutations(actorId?: string) {
  let discardedCount = 0;
  const nextMutations = readCoreOutbox().filter((mutation) => {
    const shouldDiscard =
      mutation.status !== "synced" &&
      (!actorId || getCoreMutationActorId(mutation) === actorId);

    if (shouldDiscard) {
      discardedCount += 1;
      return false;
    }

    return true;
  });

  if (discardedCount > 0) {
    writeCoreOutbox(nextMutations);
  }

  return discardedCount;
}

export function getUnsyncedOrders() {
  const orderById = new Map<string, LocalOrder>();

  readCoreOutbox()
    .filter(
      (mutation): mutation is CoreOrderMutation =>
        mutation.kind === "order" &&
        mutation.status !== "synced" &&
        !(
          mutation.status === "failed" &&
          mutation.lastError?.toLowerCase().includes("permanently deleted")
        ),
    )
    .forEach((mutation) => {
      orderById.set(mutation.payload.order.id, mutation.payload.order);
    });

  return Array.from(orderById.values());
}

export function getUnsyncedCollections() {
  const collectionById = new Map<string, LocalCollection>();

  readCoreOutbox()
    .filter(
      (mutation): mutation is CoreCollectionMutation =>
        mutation.kind === "collection" &&
        mutation.status !== "synced" &&
        !mutation.lastError?.toLowerCase().includes("permanently deleted"),
    )
    .forEach((mutation) => {
      collectionById.set(mutation.payload.collection.id, mutation.payload.collection);
    });

  return Array.from(collectionById.values());
}

export function getUnsyncedVisitProofs() {
  const visitById = new Map<string, LocalVisitRecord>();

  readCoreOutbox()
    .filter((mutation) => mutation.status !== "synced")
    .forEach((mutation) => {
      if (mutation.kind === "visit") {
        visitById.set(mutation.payload.visit.id, mutation.payload.visit);
      }

      if (mutation.kind === "order" && mutation.payload.orderStartedVisit) {
        const visit = mutation.payload.orderStartedVisit;
        visitById.set(visit.id, visit);
      }
    });

  return Array.from(visitById.values());
}

export function resetFailedCoreMutations(actorId?: string) {
  const nextMutations = readCoreOutbox().map((mutation) =>
    mutation.status === "failed" &&
    (!actorId || getCoreMutationActorId(mutation) === actorId)
      ? {
          ...mutation,
          status: "pending" as const,
          nextAttemptAt: null,
          lastError: null,
          updatedAt: new Date().toISOString(),
        }
      : mutation,
  );

  writeCoreOutbox(nextMutations);
}

export async function hydrateCoreOutboxFromBackup() {
  const currentMutations = readCoreOutbox();
  const backupMutations = await readOutboxFromIndexedDb();
  const mergedMutations = mergeMutations(currentMutations, backupMutations);
  const { mutations: normalizedMutations, resetCount } =
    resetInterruptedSyncingMutations(mergedMutations);

  if (
    normalizedMutations.length !== currentMutations.length ||
    backupMutations.length ||
    resetCount > 0
  ) {
    writeCoreOutbox(normalizedMutations);
  }

  return normalizedMutations;
}

export async function readCoreOutboxBackupFromIndexedDb() {
  return readOutboxFromIndexedDb();
}
