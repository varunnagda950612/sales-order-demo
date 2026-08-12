import {
  setLocalStorageJsonWithMaintenance,
} from "@/lib/browser/storage-maintenance";
import {
  legacyLocalCheckInStorageKey,
  localVisitStorageKey,
} from "@/lib/browser/storage-keys";
import { getIndiaDate } from "@/lib/dates/india";
import { getUnsyncedVisitProofs } from "@/lib/sync/core-outbox";
import type { SalesRouteShop, VisitOutcome } from "@/types/domain";

export type LocalVisitType = "check_in" | "order_started" | "no_order";

export type LocalVisitRecord = {
  id: string;
  shopId: string;
  orderId: string | null;
  salesPersonId: string;
  visitType: LocalVisitType;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distanceMeters: number | null;
  capturedAt: string;
  saveShopAnchor: boolean;
};

type StoredVisitRecord = Partial<LocalVisitRecord> & {
  shopId?: unknown;
  salesPersonId?: unknown;
  visitType?: unknown;
  capturedAt?: unknown;
};

export { legacyLocalCheckInStorageKey, localVisitStorageKey };

function createRecordId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getVisitType(value: unknown): LocalVisitType {
  return value === "order_started" || value === "no_order" ? value : "check_in";
}

function normalizeVisitRecord(value: unknown): LocalVisitRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as StoredVisitRecord;
  const shopId = typeof record.shopId === "string" ? record.shopId : "";
  const salesPersonId = typeof record.salesPersonId === "string" ? record.salesPersonId : "";
  const capturedAt = typeof record.capturedAt === "string" ? record.capturedAt : "";

  if (!shopId || !salesPersonId || !capturedAt) {
    return null;
  }

  return {
    id: typeof record.id === "string" && record.id ? record.id : createRecordId(),
    shopId,
    orderId: typeof record.orderId === "string" && record.orderId ? record.orderId : null,
    salesPersonId,
    visitType: getVisitType(record.visitType),
    latitude: toNullableNumber(record.latitude),
    longitude: toNullableNumber(record.longitude),
    accuracy: toNullableNumber(record.accuracy),
    distanceMeters: toNullableNumber(record.distanceMeters),
    capturedAt,
    saveShopAnchor: Boolean(record.saveShopAnchor),
  };
}

function readStoredRecords(storageKey: string) {
  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return [];
  }

  const parsedValue = JSON.parse(rawValue);
  return Array.isArray(parsedValue)
    ? parsedValue
        .map((record) => normalizeVisitRecord(record))
        .filter((record): record is LocalVisitRecord => record !== null)
    : [];
}

function sortRecords(records: LocalVisitRecord[]) {
  return [...records].sort(
    (left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime(),
  );
}

function persistMigratedRecords(records: LocalVisitRecord[]) {
  setLocalStorageJsonWithMaintenance(localVisitStorageKey, records);
  window.localStorage.removeItem(legacyLocalCheckInStorageKey);
}

export function readLocalVisitRecords(_revision = 0) {
  void _revision;

  if (typeof window === "undefined") {
    return [];
  }

  try {
    const currentRecords = readStoredRecords(localVisitStorageKey);
    const legacyRecords = readStoredRecords(legacyLocalCheckInStorageKey);
    const recordById = new Map<string, LocalVisitRecord>();

    [...currentRecords, ...legacyRecords].forEach((record) => {
      recordById.set(record.id, record);
    });

    const records = sortRecords(Array.from(recordById.values()));

    if (legacyRecords.length) {
      persistMigratedRecords(records);
    }

    return records;
  } catch {
    return [];
  }
}

export function writeLocalVisit(record: LocalVisitRecord) {
  const records = readLocalVisitRecords().filter((item) => item.id !== record.id);
  setLocalStorageJsonWithMaintenance(
    localVisitStorageKey,
    sortRecords([...records, record]),
  );
}

export function createLocalVisitRecord(input: Omit<LocalVisitRecord, "id"> & { id?: string }) {
  return {
    ...input,
    id: input.id || createRecordId(),
  };
}

function happenedOnDate(record: LocalVisitRecord, selectedDate: string) {
  try {
    return getIndiaDate(new Date(record.capturedAt)) === selectedDate;
  } catch {
    return false;
  }
}

export function applyLocalCheckIns(
  shops: SalesRouteShop[],
  salesPersonId: string,
  _revision = 0,
): SalesRouteShop[] {
  void _revision;

  const selectedDate = getIndiaDate();
  const localRecords = new Map<string, LocalVisitRecord[]>();

  [...readLocalVisitRecords(), ...getUnsyncedVisitProofs()]
    .filter(
      (record) =>
        record.salesPersonId === salesPersonId && happenedOnDate(record, selectedDate),
    )
    .forEach((record) => {
      const records = localRecords.get(record.shopId) || [];
      records.push(record);
      localRecords.set(record.shopId, records);
    });

  return shops.map((shop) => {
    const records = sortRecords(localRecords.get(shop.id) || []);
    const checkInRecord = records.find((record) => record.visitType === "check_in");
    const orderStartedRecord = records.find((record) => record.visitType === "order_started");
    const noOrderRecord = records.find((record) => record.visitType === "no_order");

    if (!checkInRecord && !orderStartedRecord && !noOrderRecord) {
      return shop;
    }

    const latestLocation = [...records]
      .reverse()
      .find((record) => record.latitude !== null && record.longitude !== null);
    const visitOutcome: VisitOutcome = orderStartedRecord
      ? "order_started"
      : noOrderRecord
        ? "no_order"
        : "checked_in";

    return {
      ...shop,
      locationLat: shop.locationLat ?? latestLocation?.latitude ?? null,
      locationLng: shop.locationLng ?? latestLocation?.longitude ?? null,
      locationAccuracy: shop.locationAccuracy ?? latestLocation?.accuracy ?? null,
      locationCapturedAt: shop.locationCapturedAt ?? latestLocation?.capturedAt ?? null,
      gpsStatus:
        shop.locationLat !== null || latestLocation?.latitude !== null ? "saved" : "pending",
      visitOutcome,
    };
  });
}
