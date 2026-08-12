"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  MapPin,
  Navigation,
  Plus,
  Search,
  Store,
  TimerReset,
  TrendingUp,
  X,
} from "lucide-react";
import {
  applyLocalCheckIns,
  checkInShop,
  markLocalNoOrder,
} from "./check-in";
import { LocalCollectionEntry } from "./local-collection-entry";
import { LocalOrderEntry } from "./local-order-entry";
import { getGoogleMapsDirectionsUrl } from "@/lib/maps/google";
import {
  readSalesRouteSnapshot,
  writeSalesRouteSnapshot,
} from "@/lib/local/sales-route-snapshot";
import { getIndiaDate } from "@/lib/dates/india";
import { readLocalOrders } from "@/lib/local/orders";
import { upsertLocalShop } from "@/lib/local/shops";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readCachedSupabaseProductSkus } from "@/lib/products/supabase-product-sku-cache";
import { getUnsyncedOrders } from "@/lib/sync/core-outbox";
import {
  formatTargetKg,
  getProgressMessage,
  type TargetProgress,
} from "@/lib/targets/progress";
import type {
  LocalOrder,
  LocalProductSku,
  SalesRouteData,
  SalesRouteShop,
} from "@/types/domain";

type SalesMyShopsProps = {
  routeData: SalesRouteData;
  allShops: SalesRouteShop[];
  salesPersonId: string;
  salesPersonName: string;
  localMode: boolean;
  initialOrders?: LocalOrder[];
  ordersRefreshKey?: number;
  productSkus?: LocalProductSku[];
  activeTargetProgress?: TargetProgress[];
  geofenceMeters: number | null;
  routeWorkAllowed?: boolean;
  routeWorkMessage?: string;
  onVisitOutcomeChanged: () => void;
  onOrderSaved: () => void;
  onShopAdded: () => void;
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

const shopStatusLabels = {
  location_pending: "Location pending",
  location_saved: "Location saved",
  order_placed: "Order placed",
  no_order: "No order",
} as const;

type ShopStatus = keyof typeof shopStatusLabels;

type CollectionTarget = {
  shop: SalesRouteShop;
  collectionType: "route" | "adhoc";
};

function normalizeShopName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getAreaVisitDay(shops: SalesRouteShop[], area: string) {
  const normalizedArea = area.trim().toLowerCase();
  return (
    shops.find(
      (shop) => shop.area.trim().toLowerCase() === normalizedArea && shop.visitDay,
    )?.visitDay || null
  );
}

function formatWeekday(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function matchesSearch(shop: SalesRouteShop, searchValue: string) {
  const value = searchValue.trim().toLowerCase();

  if (!value) {
    return true;
  }

  return [shop.name, shop.area, shop.phone, shop.address]
    .filter(Boolean)
    .some((item) => item?.toLowerCase().includes(value));
}

function getOrderDate(order: LocalOrder) {
  try {
    return getIndiaDate(new Date(order.createdAt));
  } catch {
    return "";
  }
}

function sortOrdersNewestFirst(a: LocalOrder, b: LocalOrder) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function getSameDayOrdersByShopId({
  initialOrders,
  localOrders,
  salesPersonId,
  selectedDate,
}: {
  initialOrders?: LocalOrder[];
  localOrders: LocalOrder[];
  salesPersonId: string;
  selectedDate: string;
}) {
  const orderByShopId = new Map<string, LocalOrder>();
  const matchesRouteDate = (order: LocalOrder) =>
    order.salesPersonId === salesPersonId &&
    order.status !== "cancelled" &&
    getOrderDate(order) === selectedDate;
  const canonicalOrders = (initialOrders || localOrders)
    .filter(matchesRouteDate)
    .sort(sortOrdersNewestFirst);

  canonicalOrders.forEach((order) => {
    orderByShopId.set(order.shopId, order);
  });

  getUnsyncedOrders()
    .filter(matchesRouteDate)
    .sort(sortOrdersNewestFirst)
    .forEach((order) => {
      if (!orderByShopId.has(order.shopId)) {
        orderByShopId.set(order.shopId, order);
      }
    });

  return orderByShopId;
}

function getShopStatus(shop: SalesRouteShop): ShopStatus {
  if (shop.visitOutcome === "order_started") {
    return "order_placed";
  }

  if (shop.visitOutcome === "no_order") {
    return "no_order";
  }

  return shop.gpsStatus === "saved" ? "location_saved" : "location_pending";
}

function getShopStatusClass(status: ShopStatus) {
  if (status === "location_pending") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "no_order") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "location_saved") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function AddShopDialog({
  allShops,
  salesPersonId,
  salesPersonName,
  localMode,
  persistenceEnabled,
  onClose,
  onSaved,
}: {
  allShops: SalesRouteShop[];
  salesPersonId: string;
  salesPersonName: string;
  localMode: boolean;
  persistenceEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const areaOptions = useMemo(
    () => Array.from(new Set(allShops.map((shop) => shop.area))).sort(),
    [allShops],
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [databaseDuplicate, setDatabaseDuplicate] = useState<boolean | null>(
    null,
  );
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const normalizedName = normalizeShopName(name);
  const listedDuplicate = useMemo(
    () =>
      Boolean(
        normalizedName &&
          allShops.some(
            (shop) => normalizeShopName(shop.name) === normalizedName,
          ),
      ),
    [allShops, normalizedName],
  );
  const hasDuplicate = listedDuplicate || databaseDuplicate === true;

  async function checkDuplicateName(
    requireDatabaseCheck = false,
  ): Promise<boolean | null> {
    if (!normalizedName) {
      setDatabaseDuplicate(null);
      return false;
    }

    if (listedDuplicate) {
      setDatabaseDuplicate(true);
      return true;
    }

    if (localMode || !persistenceEnabled) {
      setDatabaseDuplicate(false);
      return false;
    }

    setIsCheckingDuplicate(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("shop_name_exists", {
        p_shop_name: name,
      });

      if (!error) {
        const exists = Boolean(data);
        setDatabaseDuplicate(exists);
        return exists;
      }

      const { data: visibleShops, error: visibleShopError } = await supabase
        .from("shops")
        .select("id, name")
        .limit(2000);

      if (visibleShopError) {
        setDatabaseDuplicate(false);
        if (requireDatabaseCheck) {
          setMessage("Unable to verify this shop name against the database. Please try again.");
          return null;
        }

        return false;
      }

      const exists = (visibleShops || []).some(
        (shop) => normalizeShopName(shop.name || "") === normalizedName,
      );
      setDatabaseDuplicate(exists);
      return exists;
    } catch {
      setDatabaseDuplicate(false);
      if (requireDatabaseCheck) {
        setMessage(
          "Unable to verify this shop name against the database. Please try again.",
        );
        return null;
      }

      return false;
    } finally {
      setIsCheckingDuplicate(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!persistenceEnabled) {
      setMessage(
        "Preview mode is active. Adding a shop is disabled to protect live data.",
      );
      return;
    }

    const normalizedArea = area.trim().replace(/\s+/g, " ");
    if (!normalizedName || !normalizedArea) {
      setMessage("Shop name and area are required.");
      return;
    }

    const duplicateExists = await checkDuplicateName(true);
    if (duplicateExists === null) {
      return;
    }

    if (duplicateExists) {
      setMessage("A shop with this name already exists.");
      return;
    }

    if (!window.confirm(`Add shop "${name.trim()}"?`)) {
      return;
    }

    setIsSaving(true);
    try {
      if (localMode) {
        upsertLocalShop({
          id: crypto.randomUUID(),
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          area: normalizedArea,
          visitDay: getAreaVisitDay(allShops, normalizedArea),
          assignedTo: salesPersonId,
          locationLat: null,
          locationLng: null,
          locationAccuracy: null,
          locationCapturedAt: null,
          gpsStatus: "pending",
          visitOutcome: "not_visited",
          isOverride: false,
          routeReason: "shop_visit_day",
        });
      } else {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.from("shops").insert({
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          area: normalizedArea,
          assigned_to: salesPersonId,
          visit_day: getAreaVisitDay(allShops, normalizedArea),
        });

        if (error) {
          if (error.code === "23505") {
            setDatabaseDuplicate(true);
            setMessage("A shop with this name already exists.");
            return;
          }

          setMessage(error.message);
          return;
        }
      }

      onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-4">
      <section
        className="mx-auto my-4 w-full max-w-5xl rounded-lg bg-white p-5 shadow-xl sm:p-6"
        aria-labelledby="add-shop-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-shop-title" className="text-xl font-bold text-slate-900">
              Add New Shop
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a shop assigned to your sales route.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Close
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Shop name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setDatabaseDuplicate(null);
                setMessage(null);
              }}
              onBlur={() => void checkDuplicateName()}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
              autoComplete="off"
            />
            {isCheckingDuplicate ? (
              <p className="mt-1 text-sm text-slate-500">Checking shop name...</p>
            ) : null}
            {hasDuplicate ? (
              <p className="mt-1 text-sm font-medium text-red-700">
                A shop with this name already exists.
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
              autoComplete="tel"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Area name</span>
            <select
              value={area}
              onChange={(event) => setArea(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="">Select area</option>
              {areaOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Salesperson</span>
            <input
              type="text"
              value={salesPersonName}
              readOnly
              className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-base text-slate-700"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Address</span>
            <textarea
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            />
          </label>

          {message ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
              {message}
            </p>
          ) : null}
          {!persistenceEnabled ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              Preview mode is active. You can test this form, but adding a shop is disabled to protect live data.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={
              !persistenceEnabled ||
              !normalizedName ||
              !area ||
              hasDuplicate ||
              isCheckingDuplicate ||
              isSaving
            }
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-3 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            {isSaving ? "Adding..." : "Add shop"}
          </button>
        </form>
      </section>
    </div>
  );
}

type CheckInState = {
  shopId: string | null;
  message: string | null;
  type: "success" | "error" | null;
};

const defaultRouteVisitGeofenceMeters = 100;

function ProgressBar({ percent }: { percent: number }) {
  const activeSegments = Math.ceil(percent / 10);

  return (
    <div
      className="mt-2 grid grid-cols-10 gap-1"
      aria-label={`${percent}% target complete`}
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <span
          key={index}
          className={`h-2 rounded-full ${
            index < activeSegments ? "bg-emerald-600" : "bg-stone-100"
          }`}
        />
      ))}
    </div>
  );
}

function TargetFocusPanel({ rows }: { rows: TargetProgress[] }) {
  const summary = rows.reduce(
    (total, item) => ({
      targetKg: total.targetKg + item.target.targetKg,
      completedKg: total.completedKg + item.cappedCompletedKg,
      pendingKg: total.pendingKg + item.pendingKg,
    }),
    { targetKg: 0, completedKg: 0, pendingKg: 0 },
  );
  const percent = summary.targetKg
    ? Math.min(Math.round((summary.completedKg / summary.targetKg) * 100), 100)
    : 0;

  return (
    <section
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
      aria-label="Target focus"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-white p-2 text-emerald-700 shadow-sm">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-stone-900">Target Focus</h3>
            <p className="mt-1 text-sm text-stone-700">
              Active SKU progress from saved orders and pending sync records.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm sm:min-w-96">
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-xs font-bold uppercase text-stone-500">Target</p>
            <p className="mt-1 font-bold text-stone-900">
              {formatTargetKg(summary.targetKg)}
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-xs font-bold uppercase text-emerald-700">Done</p>
            <p className="mt-1 font-bold text-emerald-800">
              {formatTargetKg(summary.completedKg)}
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-xs font-bold uppercase text-orange-700">Left</p>
            <p className="mt-1 font-bold text-orange-800">
              {formatTargetKg(summary.pendingKg)}
            </p>
          </div>
        </div>
      </div>

      {rows.length ? (
        <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
          {rows.map((item) => (
            <article
              key={item.target.id}
              className="min-w-64 snap-start rounded-lg border border-emerald-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-stone-900">
                    {item.target.productName}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-stone-500">
                    {item.target.skuSize}
                    {item.target.skuCode ? ` - ${item.target.skuCode}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                  {item.progressPercent}%
                </span>
              </div>
              <ProgressBar percent={item.progressPercent} />
              <p className="mt-2 text-xs font-semibold text-stone-700">
                {formatTargetKg(item.pendingKg)} left
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {getProgressMessage(item.completedKg, item.target.targetKg)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm font-medium text-stone-600">
          No active SKU target is assigned for today.
        </p>
      )}

      {rows.length ? <ProgressBar percent={percent} /> : null}
    </section>
  );
}

function getVisitedShop(
  shop: SalesRouteShop,
  result: Awaited<ReturnType<typeof checkInShop>>,
): SalesRouteShop {
  return {
    ...shop,
    locationLat: shop.locationLat ?? result.position.latitude,
    locationLng: shop.locationLng ?? result.position.longitude,
    locationAccuracy: shop.locationAccuracy ?? result.position.accuracy,
    locationCapturedAt: shop.locationCapturedAt ?? result.capturedAt,
    gpsStatus: "saved",
    visitOutcome: "checked_in",
  };
}

type VisitPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  saveShopAnchor: boolean;
  distanceMeters: number | null;
};

function ShopCard({
  shop,
  salesPersonId,
  existingTodayOrder,
  checkInState,
  onCheckInStateChange,
  onLocalCheckInSaved,
  onStartOrder,
  onStartCollection,
  geofenceMeters,
  routeWorkAllowed,
  routeWorkMessage,
  writesEnabled,
  mutationUiEnabled,
}: {
  shop: SalesRouteShop;
  salesPersonId: string;
  existingTodayOrder?: LocalOrder;
  checkInState: CheckInState;
  onCheckInStateChange: (state: CheckInState) => void;
  onLocalCheckInSaved: () => void;
  onStartOrder: (
    shop: SalesRouteShop,
    visitPosition: VisitPosition,
    existingOrder?: LocalOrder,
  ) => Promise<void> | void;
  onStartCollection: (target: CollectionTarget) => void;
  geofenceMeters: number;
  routeWorkAllowed: boolean;
  routeWorkMessage: string;
  writesEnabled: boolean;
  mutationUiEnabled: boolean;
}) {
  const shopStatus = getShopStatus(shop);
  const directionsUrl = getGoogleMapsDirectionsUrl(
    shop.locationLat,
    shop.locationLng,
  );
  const isCheckingIn =
    checkInState.shopId === shop.id && checkInState.type === null;
  const statusMessage =
    checkInState.shopId === shop.id ? checkInState.message : null;
  const hasOrder = shop.visitOutcome === "order_started";
  const hasNoOrder = shop.visitOutcome === "no_order";
  const hasExistingTodayOrder = Boolean(existingTodayOrder);
  const canCollect = hasOrder || hasNoOrder;
  const routeActionsEnabled = mutationUiEnabled && routeWorkAllowed;

  async function captureAndValidateVisit() {
    if (!routeWorkAllowed) {
      onCheckInStateChange({
        shopId: shop.id,
        message: routeWorkMessage,
        type: "error",
      });
      return null;
    }

    const shouldSaveShopAnchor = shop.locationLat === null || shop.locationLng === null;

    if (shouldSaveShopAnchor) {
      const shouldSaveAnchor = window.confirm(
        "This shop does not have saved GPS yet. Save your current location as this shop GPS?",
      );

      if (!shouldSaveAnchor) {
        return null;
      }
    }

    onCheckInStateChange({
      shopId: shop.id,
      message: "Capturing location...",
      type: null,
    });

    try {
      const result = await checkInShop(shop, salesPersonId, {
        maxDistanceMeters: geofenceMeters,
        persist: false,
      });
      const detail =
        result.distanceMeters === null
          ? shouldSaveShopAnchor
            ? "GPS anchor will be saved with the final visit status."
            : "GPS verified."
          : `${result.distanceMeters} m from shop.`;

      onCheckInStateChange({
        shopId: shop.id,
        message: `GPS check completed. ${detail}`,
        type: "success",
      });

      return {
        shop: getVisitedShop(shop, result),
        visitPosition: {
          ...result.position,
          capturedAt: result.capturedAt,
          saveShopAnchor: shouldSaveShopAnchor,
          distanceMeters: result.distanceMeters,
        },
      };
    } catch (error) {
      onCheckInStateChange({
        shopId: shop.id,
        message: error instanceof Error ? error.message : "Visit check failed.",
        type: "error",
      });
      return null;
    }
  }

  async function handleVisitShop() {
    const visitResult = await captureAndValidateVisit();

    if (visitResult) {
      onStartOrder(visitResult.shop, visitResult.visitPosition, existingTodayOrder);
    }
  }

  async function handleNoOrder() {
    const visitResult = await captureAndValidateVisit();

    if (!visitResult) {
      return;
    }

    if (!writesEnabled) {
      onCheckInStateChange({
        shopId: shop.id,
        message: "Preview GPS check completed. No Order was not saved.",
        type: "success",
      });
      return;
    }

    if (!window.confirm("Confirm No Order for this shop?")) {
      return;
    }

    try {
      const commitResult = markLocalNoOrder(visitResult.shop, salesPersonId, {
        saveShopAnchor: visitResult.visitPosition.saveShopAnchor,
        distanceMeters: visitResult.visitPosition.distanceMeters,
      });

      if (commitResult.recoveryWarning) {
        throw new Error(commitResult.recoveryWarning);
      }

      onLocalCheckInSaved();
      onCheckInStateChange({
        shopId: shop.id,
        message: commitResult.syncQueued
          ? "No Order saved on this device. Syncing to server."
          : "No Order saved locally.",
        type: "success",
      });
    } catch (error) {
      onCheckInStateChange({
        shopId: shop.id,
        message: error instanceof Error ? error.message : "No Order failed.",
        type: "error",
      });
    }
  }

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-stone-900">{shop.name}</h3>
            {shop.isOverride ? (
              <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                Override
              </span>
            ) : null}
            {hasExistingTodayOrder && !hasOrder ? (
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">
                Today&apos;s order exists
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-medium text-stone-600">{shop.area}</p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-bold ${getShopStatusClass(shopStatus)}`}
        >
          {shopStatusLabels[shopStatus]}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-sm text-stone-600">
        {shop.address ? (
          <p className="flex gap-2">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-stone-400"
              aria-hidden="true"
            />
            <span>{shop.address}</span>
          </p>
        ) : null}
        {shop.phone ? (
          <p>
            <span className="font-semibold text-stone-700">Phone:</span>{" "}
            {shop.phone}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Get Direction
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-stone-300 px-3 py-2 text-sm font-bold text-white"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Get Direction
          </button>
        )}
        <button
          type="button"
          disabled={!routeActionsEnabled || isCheckingIn || hasOrder}
          onClick={handleVisitShop}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-white disabled:text-stone-500"
        >
          {isCheckingIn
            ? "Checking..."
            : shop.visitOutcome === "order_started"
              ? "Order Placed"
              : hasNoOrder
                ? "Add Order"
                : hasExistingTodayOrder
                  ? "Update Order"
                  : "Order"}
        </button>
        <button
          type="button"
          disabled={
            !routeActionsEnabled ||
            isCheckingIn ||
            hasOrder ||
            hasNoOrder ||
            hasExistingTodayOrder
          }
          onClick={handleNoOrder}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-white disabled:text-stone-500"
        >
          {shop.visitOutcome === "no_order" ? "No Order Saved" : "No Order"}
        </button>
        {routeActionsEnabled && canCollect ? (
          <button
            type="button"
            onClick={() => onStartCollection({ shop, collectionType: "route" })}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
          >
            Collection
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-500"
          >
            Collection
          </button>
        )}
      </div>

      {statusMessage ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
            checkInState.type === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {statusMessage}
        </p>
      ) : null}
    </article>
  );
}

export function SalesMyShops({
  routeData,
  allShops,
  salesPersonId,
  salesPersonName,
  localMode,
  initialOrders,
  ordersRefreshKey = 0,
  productSkus,
  activeTargetProgress = [],
  geofenceMeters,
  routeWorkAllowed = true,
  routeWorkMessage = "",
  onVisitOutcomeChanged,
  onOrderSaved,
  onShopAdded,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: SalesMyShopsProps) {
  const router = useRouter();
  const effectiveGeofenceMeters =
    geofenceMeters || defaultRouteVisitGeofenceMeters;
  const [initialSnapshotMessage] = useState(() => {
    if (!localMode) {
      return null;
    }

    const snapshot = readSalesRouteSnapshot(salesPersonId);
    return snapshot
      ? `Loaded local route snapshot saved at ${snapshot.savedAt}.`
      : "No local route snapshot found yet.";
  });
  const [activeRouteData] = useState(() => {
    if (!localMode) {
      return routeData;
    }

    return readSalesRouteSnapshot(salesPersonId)?.routeData || routeData;
  });
  const [searchValue, setSearchValue] = useState("");
  const [selectedArea, setSelectedArea] = useState("all");
  const [gpsFilter, setGpsFilter] = useState("all");
  const [shops, setShops] = useState(() =>
    applyLocalCheckIns(activeRouteData.shops, salesPersonId),
  );
  const [checkInState, setCheckInState] = useState<CheckInState>({
    shopId: null,
    message: null,
    type: null,
  });
  const [orderShop, setOrderShop] = useState<SalesRouteShop | null>(null);
  const [orderVisitPosition, setOrderVisitPosition] =
    useState<VisitPosition | null>(null);
  const [orderExistingOrder, setOrderExistingOrder] =
    useState<LocalOrder | null>(null);
  const [loadedProductSkus, setLoadedProductSkus] = useState<LocalProductSku[] | null>(
    () => productSkus || null,
  );
  const [collectionTarget, setCollectionTarget] =
    useState<CollectionTarget | null>(null);
  const [isAddingShop, setIsAddingShop] = useState(false);

  useEffect(() => {
    if (localMode) {
      return;
    }

    writeSalesRouteSnapshot(salesPersonId, routeData);
  }, [localMode, routeData, salesPersonId]);

  const filteredShops = useMemo(
    () =>
      shops.filter((shop) => {
        const areaMatches =
          selectedArea === "all" || shop.area === selectedArea;
        const gpsMatches = gpsFilter === "all" || shop.gpsStatus === gpsFilter;
        return areaMatches && gpsMatches && matchesSearch(shop, searchValue);
      }),
    [gpsFilter, searchValue, selectedArea, shops],
  );
  const summaryCounts = useMemo(
    () => ({
      totalShops: shops.length,
      completedCount: shops.filter(
        (shop) =>
          shop.visitOutcome === "order_started" ||
          shop.visitOutcome === "no_order",
      ).length,
      gpsSavedCount: shops.filter((shop) => shop.gpsStatus === "saved").length,
      overrideAreaCount: shops.filter((shop) => shop.isOverride).length,
    }),
    [shops],
  );
  const sameDayOrdersByShopId = useMemo(
    () =>
      getSameDayOrdersByShopId({
        initialOrders,
        localOrders: initialOrders ? [] : readLocalOrders(ordersRefreshKey),
        salesPersonId,
        selectedDate: activeRouteData.summary.selectedDate,
      }),
    [
      activeRouteData.summary.selectedDate,
      initialOrders,
      ordersRefreshKey,
      salesPersonId,
    ],
  );

  function handleLocalCheckInSaved() {
    setShops(applyLocalCheckIns(activeRouteData.shops, salesPersonId));
    onVisitOutcomeChanged();
  }

  function handleLocalOrderSaved() {
    setShops(applyLocalCheckIns(activeRouteData.shops, salesPersonId));
    onVisitOutcomeChanged();
    onOrderSaved();
  }

  async function loadProductSkusForOrder() {
    if (loadedProductSkus) {
      return loadedProductSkus;
    }

    if (localMode) {
      return null;
    }

    const skus = await readCachedSupabaseProductSkus(createSupabaseBrowserClient());
    setLoadedProductSkus(skus);
    return skus;
  }

  async function handleStartOrder(
    shop: SalesRouteShop,
    visitPosition: VisitPosition,
    existingOrder?: LocalOrder,
  ) {
    setCheckInState({
      shopId: shop.id,
      message: "Loading products...",
      type: null,
    });

    try {
      await loadProductSkusForOrder();
      setOrderShop(shop);
      setOrderVisitPosition(visitPosition);
      setOrderExistingOrder(existingOrder || null);
      setCheckInState({
        shopId: shop.id,
        message: "Order form ready.",
        type: "success",
      });
    } catch (error) {
      setCheckInState({
        shopId: shop.id,
        message:
          error instanceof Error ? error.message : "Unable to load products.",
        type: "error",
      });
    }
  }

  function handleShopAdded() {
    onShopAdded();
    if (!localMode) {
      router.refresh();
    }
  }

  return (
    <section
      id="shops"
      className="scroll-mt-32 space-y-4"
      aria-labelledby="my-shops-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">
              {formatWeekday(activeRouteData.summary.weekday)} -{" "}
              {activeRouteData.summary.selectedDate}
            </p>
            <h2
              id="my-shops-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              My Shops
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Today&apos;s scheduled route shops, including any temporary
              override areas.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <button
              type="button"
              disabled={!mutationUiEnabled}
              onClick={() => setIsAddingShop(true)}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Shop
            </button>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Shops
                </p>
                <p className="mt-1 text-xl font-bold text-stone-900">
                  {summaryCounts.totalShops}
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Completed
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {summaryCounts.completedCount}
                </p>
              </div>
              {/* <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  GPS Saved
                </p>
                <p className="mt-1 text-xl font-bold text-stone-900">
                  {summaryCounts.gpsSavedCount}
                </p>
              </div> */}
              {/* <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Overrides
                </p>
                <p className="mt-1 text-xl font-bold text-orange-700">
                  {summaryCounts.overrideAreaCount}
                </p>
              </div> */}
            </div>
          </div>
        </div>

        {activeRouteData.overrideAreas.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeRouteData.overrideAreas.map((area) => (
              <span
                key={area}
                className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800"
              >
                <TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
                {area}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {!writesEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Live read-only mode is active.</p>
          <p className="mt-1">
            {mutationUiEnabled
              ? "You can preview visit, order, and collection flows, but final saves do not write to Supabase."
              : "Route shops are visible from Supabase, but visit, order, and collection actions are disabled."}
          </p>
          {initialSnapshotMessage ? (
            <p className="mt-2 font-medium">{initialSnapshotMessage}</p>
          ) : null}
        </div>
      ) : null}

      {!routeWorkAllowed ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Route actions are paused.</p>
          <p className="mt-1">{routeWorkMessage}</p>
        </div>
      ) : null}

      <TargetFocusPanel rows={activeTargetProgress} />

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Search</span>
            <span className="mt-2 flex rounded-lg border border-stone-300 bg-white transition-colors focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-100">
              <Search
                className="ml-3 mt-2.5 h-4 w-4 text-stone-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border-0 px-3 py-2 text-base text-stone-900 focus:outline-none"
                placeholder="Shop, area, phone"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Area</span>
            <select
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All areas</option>
              {activeRouteData.areaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-stone-700">GPS</span>
            <select
              value={gpsFilter}
              onChange={(event) => setGpsFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All GPS</option>
              <option value="saved">Saved</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </div>
      </div>

      {filteredShops.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredShops.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              salesPersonId={salesPersonId}
              existingTodayOrder={sameDayOrdersByShopId.get(shop.id)}
              checkInState={checkInState}
              onCheckInStateChange={setCheckInState}
              onLocalCheckInSaved={handleLocalCheckInSaved}
              onStartOrder={handleStartOrder}
              onStartCollection={setCollectionTarget}
              geofenceMeters={effectiveGeofenceMeters}
              routeWorkAllowed={routeWorkAllowed}
              routeWorkMessage={routeWorkMessage}
              writesEnabled={writesEnabled}
              mutationUiEnabled={mutationUiEnabled}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Store
            className="mx-auto h-8 w-8 text-stone-400"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-bold text-stone-900">
            No shops found
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            Change the search, area, or GPS filter to see more shops.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex gap-2">
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <p>
            {writesEnabled
              ? "Check-in, No Order, route orders, and collections are active in this mode."
              : mutationUiEnabled
                ? "Preview mode is active. Final saves remain disabled until Supabase writes are enabled."
                : "This page is read-only until Supabase writes are enabled."}
          </p>
        </div>
      </div>

      {mutationUiEnabled && orderShop ? (
        <LocalOrderEntry
          shop={orderShop}
          salesPersonId={salesPersonId}
          productSkus={loadedProductSkus || undefined}
          activeTargetProgress={activeTargetProgress}
          visitPosition={orderVisitPosition}
          persistenceEnabled={writesEnabled}
          onClose={() => {
            setOrderShop(null);
            setOrderVisitPosition(null);
            setOrderExistingOrder(null);
          }}
          existingOrder={orderExistingOrder || undefined}
          onSaved={handleLocalOrderSaved}
        />
      ) : null}

      {mutationUiEnabled && collectionTarget ? (
        <LocalCollectionEntry
          shop={collectionTarget.shop}
          salesPersonId={salesPersonId}
          collectionType={collectionTarget.collectionType}
          persistenceEnabled={writesEnabled}
          onClose={() => setCollectionTarget(null)}
          onSaved={() => setCollectionTarget(null)}
        />
      ) : null}

      {mutationUiEnabled && isAddingShop ? (
        <AddShopDialog
          allShops={allShops}
          salesPersonId={salesPersonId}
          salesPersonName={salesPersonName}
          localMode={localMode}
          persistenceEnabled={writesEnabled}
          onClose={() => setIsAddingShop(false)}
          onSaved={handleShopAdded}
        />
      ) : null}
    </section>
  );
}
