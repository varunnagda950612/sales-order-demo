import { localCollectionsStorageKey } from "./collections";
import { localOrdersStorageKey } from "./orders";
import { localProductsStorageKey } from "./products";
import { localSalesDaySessionsStorageKey } from "./sales-day-sessions";
import { salesRouteSnapshotStorageKey } from "./sales-route-snapshot";
import { localShopsStorageKey } from "./shops";
import { localTargetsStorageKey } from "./targets";
import { localUsersStorageKey } from "./users";
import { legacyLocalCheckInStorageKey, localVisitStorageKey } from "@/features/sales/check-in";

export type LocalDataKey =
  | "orders"
  | "collections"
  | "visitProofs"
  | "legacyCheckIns"
  | "products"
  | "shops"
  | "targets"
  | "users"
  | "salesDaySessions"
  | "salesRouteSnapshot";

export type LocalDataExport = {
  app: "manish-masala-sales-order-app";
  version: 1;
  exportedAt: string;
  data: Record<LocalDataKey, string | null>;
};

export const localDataItems: Array<{ key: LocalDataKey; label: string; storageKey: string }> = [
  { key: "orders", label: "Orders", storageKey: localOrdersStorageKey },
  { key: "collections", label: "Collections", storageKey: localCollectionsStorageKey },
  { key: "visitProofs", label: "Visit proofs", storageKey: localVisitStorageKey },
  { key: "legacyCheckIns", label: "Legacy check-ins", storageKey: legacyLocalCheckInStorageKey },
  { key: "products", label: "Products/SKUs", storageKey: localProductsStorageKey },
  { key: "shops", label: "Shops", storageKey: localShopsStorageKey },
  { key: "targets", label: "Targets", storageKey: localTargetsStorageKey },
  { key: "users", label: "Users", storageKey: localUsersStorageKey },
  { key: "salesDaySessions", label: "Sales day sessions", storageKey: localSalesDaySessionsStorageKey },
  { key: "salesRouteSnapshot", label: "Sales route snapshot", storageKey: salesRouteSnapshotStorageKey },
];

export function exportLocalAppData(): LocalDataExport {
  const data = localDataItems.reduce(
    (items, item) => ({
      ...items,
      [item.key]: window.localStorage.getItem(item.storageKey),
    }),
    {} as Record<LocalDataKey, string | null>,
  );

  return {
    app: "manish-masala-sales-order-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function importLocalAppData(exportData: LocalDataExport, selectedKeys: LocalDataKey[]) {
  selectedKeys.forEach((key) => {
    const item = localDataItems.find((entry) => entry.key === key);
    const value = exportData.data[key];

    if (!item) {
      return;
    }

    if (value === null) {
      window.localStorage.removeItem(item.storageKey);
    } else {
      window.localStorage.setItem(item.storageKey, value);
    }
  });
}

export function resetLocalAppData(selectedKeys: LocalDataKey[]) {
  selectedKeys.forEach((key) => {
    const item = localDataItems.find((entry) => entry.key === key);

    if (item) {
      window.localStorage.removeItem(item.storageKey);
    }
  });
}
