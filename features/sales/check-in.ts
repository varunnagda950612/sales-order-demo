import { getDistanceMeters } from "@/lib/gps/distance";
import {
  applyLocalCheckIns,
  createLocalVisitRecord,
  localVisitStorageKey,
  legacyLocalCheckInStorageKey,
  readLocalVisitRecords,
  type LocalVisitRecord,
} from "@/lib/local/visit-proofs";
import { commitCoreVisit } from "@/lib/sync/core-mutations";
import type { SalesRouteShop } from "@/types/domain";

export {
  applyLocalCheckIns,
  localVisitStorageKey,
  legacyLocalCheckInStorageKey,
  readLocalVisitRecords,
};
export type { LocalVisitRecord };

type CapturedPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type CheckInResult = {
  distanceMeters: number | null;
  savedShopAnchor: boolean;
  storageMode: "local" | "preview" | "queued";
  position: CapturedPosition;
  capturedAt: string;
};

function getBrowserPosition() {
  return new Promise<CapturedPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {
        reject(new Error("Location permission is required for check-in."));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      },
    );
  });
}

function makeFollowUpVisit(
  shop: SalesRouteShop,
  salesPersonId: string,
  visitType: "order_started" | "no_order",
  options: { saveShopAnchor?: boolean; distanceMeters?: number | null } = {},
) {
  if (shop.visitOutcome === "not_visited") {
    throw new Error("Check in before recording a visit outcome.");
  }

  return createLocalVisitRecord({
    shopId: shop.id,
    orderId: null,
    salesPersonId,
    visitType,
    latitude: shop.locationLat,
    longitude: shop.locationLng,
    accuracy: shop.locationAccuracy,
    distanceMeters: options.distanceMeters ?? null,
    capturedAt: new Date().toISOString(),
    saveShopAnchor: Boolean(options.saveShopAnchor),
  });
}

export function markLocalNoOrder(
  shop: SalesRouteShop,
  salesPersonId: string,
  options: { saveShopAnchor?: boolean; distanceMeters?: number | null } = {},
) {
  return commitCoreVisit(makeFollowUpVisit(shop, salesPersonId, "no_order", options));
}

export function markLocalOrderStarted(shop: SalesRouteShop, salesPersonId: string) {
  return commitCoreVisit(makeFollowUpVisit(shop, salesPersonId, "order_started"));
}

export async function checkInShop(
  shop: SalesRouteShop,
  salesPersonId: string,
  options: { maxDistanceMeters?: number; persist?: boolean } = {},
): Promise<CheckInResult> {
  const position = await getBrowserPosition();
  const capturedAt = new Date().toISOString();
  const hasShopAnchor = shop.locationLat !== null && shop.locationLng !== null;
  const distanceMeters = hasShopAnchor
    ? getDistanceMeters(position.latitude, position.longitude, shop.locationLat!, shop.locationLng!)
    : null;

  if (
    typeof options.maxDistanceMeters === "number" &&
    distanceMeters !== null &&
    distanceMeters > options.maxDistanceMeters
  ) {
    throw new Error(`You are ${distanceMeters} m from the shop. Move within ${options.maxDistanceMeters} m to continue.`);
  }

  if (options.persist === false) {
    return {
      distanceMeters,
      savedShopAnchor: false,
      storageMode: "preview",
      position,
      capturedAt,
    };
  }

  const commitResult = commitCoreVisit(
    createLocalVisitRecord({
      shopId: shop.id,
      orderId: null,
      salesPersonId,
      visitType: "check_in",
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      distanceMeters,
      capturedAt,
      saveShopAnchor: !hasShopAnchor,
    }),
  );

  if (commitResult.recoveryWarning) {
    throw new Error(commitResult.recoveryWarning);
  }

  return {
    distanceMeters,
    savedShopAnchor: !hasShopAnchor,
    storageMode: commitResult.syncQueued ? "queued" : "local",
    position,
    capturedAt,
  };
}
