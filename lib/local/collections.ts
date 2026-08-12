import {
  setLocalStorageJsonWithMaintenance,
} from "@/lib/browser/storage-maintenance";
import { localCollectionsStorageKey } from "@/lib/browser/storage-keys";
import type { LocalCollection, LocalCollectionBill, PaymentMode } from "@/types/domain";

export { localCollectionsStorageKey };

export const paymentModeLabels: Record<PaymentMode, string> = {
  cash: "Cash",
  cheque: "Cheque",
  upi: "UPI",
};

export function readLocalCollections(_revision = 0) {
  void _revision;

  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(localCollectionsStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as LocalCollection[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalCollection(collection: LocalCollection) {
  const collections = readLocalCollections().filter((item) => item.id !== collection.id);
  setLocalStorageJsonWithMaintenance(localCollectionsStorageKey, [
    ...collections,
    collection,
  ]);
}

export function deleteLocalCollection(collectionId: string) {
  const collections = readLocalCollections().filter((item) => item.id !== collectionId);
  setLocalStorageJsonWithMaintenance(localCollectionsStorageKey, collections);
}

export function getCollectionAmount(collection: LocalCollection) {
  return collection.bills.reduce((total, bill) => total + bill.amount, 0);
}

export function buildLocalCollection(input: {
  existingCollection?: LocalCollection;
  shopId: string;
  salesPersonId: string;
  collectionType: "route" | "adhoc";
  bills: LocalCollectionBill[];
}) {
  const now = new Date().toISOString();

  return {
    id: input.existingCollection?.id || crypto.randomUUID(),
    shopId: input.shopId,
    salesPersonId: input.salesPersonId,
    collectionType: input.collectionType,
    status: input.existingCollection ? ("updated" as const) : ("placed" as const),
    bills: input.bills.map((bill) => ({
      ...bill,
      notes: bill.notes.trim(),
    })),
    createdAt: input.existingCollection?.createdAt || now,
    updatedAt: now,
  };
}
