import { isLocalAppMode } from "@/lib/config/app-mode";
import { getIndiaDate } from "@/lib/dates/india";
import {
  coreOutboxStorageKey,
  legacyLocalCheckInStorageKey,
  localCollectionsStorageKey,
  localOrdersStorageKey,
  localVisitStorageKey,
} from "@/lib/browser/storage-keys";

type MaintenanceLevel = "normal" | "emergency";

type MaintenanceOptions = {
  level?: MaintenanceLevel;
  reason?: string;
};

type StoredMutation = {
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type PrunedCounts = {
  orders: number;
  collections: number;
  visitProofs: number;
  legacyVisitProofs: number;
  coreOutbox: number;
};

export type BrowserStorageMaintenanceResult = {
  attempted: boolean;
  skippedReason: string | null;
  pruned: PrunedCounts;
};

const emptyPrunedCounts: PrunedCounts = {
  orders: 0,
  collections: 0,
  visitProofs: 0,
  legacyVisitProofs: 0,
  coreOutbox: 0,
};

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const storageError = error as { code?: number; name?: string };

  return (
    storageError.name === "QuotaExceededError" ||
    storageError.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    storageError.code === 22 ||
    storageError.code === 1014
  );
}

function readJsonArray(storageKey: string) {
  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function writeJsonArray(storageKey: string, records: unknown[]) {
  if (records.length) {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
    return;
  }

  window.localStorage.removeItem(storageKey);
}

function getCutoffDate(level: MaintenanceLevel) {
  const retainedDays = level === "emergency" ? 1 : 7;
  const today = getIndiaDate();
  const cutoffDate = new Date(`${today}T00:00:00.000Z`);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retainedDays + 1);

  return cutoffDate.toISOString().slice(0, 10);
}

function toIndiaDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return getIndiaDate(parsedDate);
}

function getRecordDate(record: unknown, dateKeys: string[]) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const storedRecord = record as Record<string, unknown>;

  for (const key of dateKeys) {
    const dateValue = toIndiaDate(storedRecord[key]);

    if (dateValue) {
      return dateValue;
    }
  }

  return null;
}

function pruneOperationalRecords(
  storageKey: string,
  cutoffDate: string,
  dateKeys: string[],
) {
  const records = readJsonArray(storageKey);
  const retainedRecords = records.filter((record) => {
    const recordDate = getRecordDate(record, dateKeys);
    return !recordDate || recordDate >= cutoffDate;
  });

  if (retainedRecords.length !== records.length) {
    writeJsonArray(storageKey, retainedRecords);
  }

  return records.length - retainedRecords.length;
}

function hasBlockingCoreMutation(mutations: StoredMutation[]) {
  return mutations.some((mutation) => mutation.status !== "synced");
}

export function pruneStaleSyncedCoreMutations<T extends StoredMutation>(
  mutations: T[],
  level: MaintenanceLevel = "normal",
) {
  void level;

  return mutations.filter((mutation) => mutation.status !== "synced");
}

function pruneCoreOutbox(level: MaintenanceLevel) {
  const mutations = readJsonArray(coreOutboxStorageKey) as StoredMutation[];

  if (hasBlockingCoreMutation(mutations)) {
    return { pruned: 0, blocked: true };
  }

  const retainedMutations = pruneStaleSyncedCoreMutations(mutations, level);

  if (retainedMutations.length !== mutations.length) {
    writeJsonArray(coreOutboxStorageKey, retainedMutations);
  }

  return {
    pruned: mutations.length - retainedMutations.length,
    blocked: false,
  };
}

export function runBrowserStorageMaintenance(
  options: MaintenanceOptions = {},
): BrowserStorageMaintenanceResult {
  const level = options.level || "normal";

  if (!canUseBrowserStorage()) {
    return {
      attempted: false,
      skippedReason: "browser-storage-unavailable",
      pruned: { ...emptyPrunedCounts },
    };
  }

  if (isLocalAppMode()) {
    return {
      attempted: false,
      skippedReason: "local-app-mode",
      pruned: { ...emptyPrunedCounts },
    };
  }

  const cutoffDate = getCutoffDate(level);

  try {
    const coreOutboxResult = pruneCoreOutbox(level);

    if (coreOutboxResult.blocked) {
      return {
        attempted: false,
        skippedReason: "pending-core-sync",
        pruned: { ...emptyPrunedCounts },
      };
    }

    return {
      attempted: true,
      skippedReason: null,
      pruned: {
        orders: pruneOperationalRecords(localOrdersStorageKey, cutoffDate, [
          "updatedAt",
          "createdAt",
          "visitCapturedAt",
        ]),
        collections: pruneOperationalRecords(localCollectionsStorageKey, cutoffDate, [
          "updatedAt",
          "createdAt",
        ]),
        visitProofs: pruneOperationalRecords(localVisitStorageKey, cutoffDate, [
          "capturedAt",
        ]),
        legacyVisitProofs: pruneOperationalRecords(
          legacyLocalCheckInStorageKey,
          cutoffDate,
          ["capturedAt"],
        ),
        coreOutbox: coreOutboxResult.pruned,
      },
    };
  } catch {
    return {
      attempted: false,
      skippedReason: "maintenance-write-failed",
      pruned: { ...emptyPrunedCounts },
    };
  }
}

export function setLocalStorageJsonWithMaintenance(
  storageKey: string,
  value: unknown,
) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }
  }

  runBrowserStorageMaintenance({
    level: "emergency",
    reason: `quota:${storageKey}`,
  });

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}
