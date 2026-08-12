"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Share2 } from "lucide-react";
import { OrderDetailPanel } from "@/features/orders/order-detail-panel";
import { readLocalOrders } from "@/lib/local/orders";
import { getUnsyncedOrders } from "@/lib/sync/core-outbox";
import { readOrdersPage } from "@/lib/admin/paged-read-api";
import { LocalOrderEntry } from "./local-order-entry";
import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  getIndiaDate,
  getUtcRangeForIndiaDate,
} from "@/lib/dates/india";
import { downloadBlob, fileSafe, personFileSafe } from "@/lib/browser/download";
import {
  mergeUniqueShops,
  readSupabaseOrderListWithShops,
  readSupabaseOrderWithShop,
  readSupabaseOrdersWithShops,
} from "@/lib/repositories/supabase-read";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readCachedSupabaseProductSkus } from "@/lib/products/supabase-product-sku-cache";
import { createOffsetCursor } from "@/lib/repositories/read-pagination";
import type { TargetProgress } from "@/lib/targets/progress";
import type {
  LocalOrder,
  LocalProductSku,
  SalesRouteShop,
} from "@/types/domain";

type SalesMyOrdersProps = {
  salesPersonId: string;
  salesPersonName: string;
  shops: SalesRouteShop[];
  productSkus?: LocalProductSku[];
  activeTargetProgress?: TargetProgress[];
  refreshKey: number;
  initialOrders?: LocalOrder[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

function formatDateTime(value: string) {
  return formatDateTimeForDisplay(value);
}

function getIndiaDateValue(value: string | Date) {
  return getIndiaDate(new Date(value));
}

function getIndiaTimeValue(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function canSalesEditOrder(order: LocalOrder) {
  return getIndiaDateValue(order.createdAt) === getIndiaDateValue(new Date());
}

const salesOrderPageSize = 100;
const deltaOverlapMs = 5_000;

function getDeltaCheckpoint() {
  return new Date(Date.now() - deltaOverlapMs).toISOString();
}

function mergeOrdersForDisplay(
  initialOrders: LocalOrder[] | undefined,
  localOrders: LocalOrder[],
) {
  const orderById = new Map<string, LocalOrder>();

  (initialOrders || localOrders).forEach((order) => {
    orderById.set(order.id, order);
  });

  getUnsyncedOrders().forEach((order) => {
    orderById.set(order.id, order);
  });

  return Array.from(orderById.values());
}

function mergeOrderPage(currentOrders: LocalOrder[], nextOrders: LocalOrder[]) {
  const orderById = new Map(currentOrders.map((order) => [order.id, order]));

  nextOrders.forEach((order) => {
    orderById.set(order.id, order);
  });

  return Array.from(orderById.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function SalesMyOrders({
  salesPersonId,
  salesPersonName,
  shops,
  productSkus,
  activeTargetProgress = [],
  refreshKey,
  initialOrders,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: SalesMyOrdersProps) {
  const today = getIndiaDateValue(new Date());
  const [selectedOrder, setSelectedOrder] = useState<LocalOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<LocalOrder | null>(null);
  const [loadedProductSkus, setLoadedProductSkus] = useState<
    LocalProductSku[] | null
  >(() => productSkus || null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [liveOrders, setLiveOrders] = useState<LocalOrder[] | null>(
    () => initialOrders?.slice(0, salesOrderPageSize) || null,
  );
  const [liveShops, setLiveShops] = useState<SalesRouteShop[]>([]);
  const [nextOrderCursor, setNextOrderCursor] = useState<string | null>(() =>
    initialOrders && initialOrders.length > salesOrderPageSize
      ? createOffsetCursor(salesOrderPageSize)
      : null,
  );
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const [isLoadingNextOrders, setIsLoadingNextOrders] = useState(false);
  const [dateMessage, setDateMessage] = useState("");
  const didSkipInitialDateReadRef = useRef(false);
  const orderDeltaSinceRef = useRef(getDeltaCheckpoint());
  const isDeltaRefreshPendingRef = useRef(false);
  const displayShops = useMemo(
    () => mergeUniqueShops(shops, liveShops),
    [liveShops, shops],
  );
  const shopById = useMemo(
    () => new Map(displayShops.map((shop) => [shop.id, shop])),
    [displayShops],
  );
  const liveOrderSource = liveOrders ?? initialOrders;
  const orders = useMemo(
    () =>
      mergeOrdersForDisplay(
        liveOrderSource,
        liveOrderSource ? [] : readLocalOrders(refreshKey + localRefreshKey),
      )
        .filter((order) => order.salesPersonId === salesPersonId)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [liveOrderSource, localRefreshKey, refreshKey, salesPersonId],
  );
  const areaOptions = useMemo(
    () =>
      Array.from(new Set(displayShops.map((shop) => shop.area))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [displayShops],
  );
  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        const orderDate = getIndiaDateValue(order.createdAt);
        const orderTime = getIndiaTimeValue(order.createdAt);
        const shop = shopById.get(order.shopId);

        return (
          (selectedArea === "all" || shop?.area === selectedArea) &&
          (!selectedDate || orderDate === selectedDate) &&
          (!timeFrom || orderTime >= timeFrom) &&
          (!timeTo || orderTime <= timeTo)
        );
      }),
    [orders, selectedArea, selectedDate, shopById, timeFrom, timeTo],
  );

  useEffect(() => {
    if (!initialOrders) {
      return;
    }

    if (!didSkipInitialDateReadRef.current) {
      didSkipInitialDateReadRef.current = true;
      return;
    }

    if (!selectedDate) {
      const timeoutId = window.setTimeout(() => {
        setLiveOrders([]);
        setLiveShops([]);
        setNextOrderCursor(null);
        setDateMessage("Select a date to load orders.");
      });

      return () => window.clearTimeout(timeoutId);
    }

    const range = getUtcRangeForIndiaDate(selectedDate);
    let isActive = true;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingDate(true);
      setDateMessage("");
      const shouldUsePagedRead = !timeFrom && !timeTo;
      const readPromise = shouldUsePagedRead
        ? readOrdersPage({
            salesPersonId,
            area: selectedArea === "all" ? undefined : selectedArea,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            limit: salesOrderPageSize,
            includeSummary: false,
          })
        : readSupabaseOrderListWithShops(createSupabaseBrowserClient(), {
            salesPersonId,
            area: selectedArea === "all" ? undefined : selectedArea,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            ascending: true,
          }).then((ordersRead) => ({
            orders: ordersRead.orders,
            shops: ordersRead.shops,
            nextCursor: null,
            summary: null,
          }));

      readPromise
        .then((ordersRead) => {
          if (!isActive) {
            return;
          }

          setLiveOrders(ordersRead.orders);
          setLiveShops(ordersRead.shops);
          setNextOrderCursor(shouldUsePagedRead ? ordersRead.nextCursor : null);
          orderDeltaSinceRef.current = getDeltaCheckpoint();
          setDateMessage("");
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          setDateMessage(
            error instanceof Error ? error.message : "Unable to load orders.",
          );
        })
        .finally(() => {
          if (isActive) {
            setIsLoadingDate(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    initialOrders,
    salesPersonId,
    selectedArea,
    selectedDate,
    timeFrom,
    timeTo,
  ]);

  const refreshChangedOrders = useCallback(async () => {
    if (
      !initialOrders ||
      !selectedDate ||
      isDeltaRefreshPendingRef.current ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    ) {
      return;
    }

    const range = getUtcRangeForIndiaDate(selectedDate);
    const nextCheckpoint = getDeltaCheckpoint();
    let cursor: string | null = null;
    let changedOrders: LocalOrder[] = [];
    let changedShops: SalesRouteShop[] = [];
    isDeltaRefreshPendingRef.current = true;

    try {
      for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
        const ordersRead = await readOrdersPage({
          salesPersonId,
          area: selectedArea === "all" ? undefined : selectedArea,
          createdAtFrom: range.start,
          createdAtTo: range.end,
          updatedAtFrom: orderDeltaSinceRef.current,
          cursor,
          limit: salesOrderPageSize,
          includeSummary: false,
        });

        changedOrders = mergeOrderPage(changedOrders, ordersRead.orders);
        changedShops = mergeUniqueShops(changedShops, ordersRead.shops);
        cursor = ordersRead.nextCursor;

        if (!cursor) {
          break;
        }
      }

      if (changedOrders.length) {
        setLiveOrders((currentOrders) =>
          mergeOrderPage(currentOrders || [], changedOrders),
        );
      }

      if (changedShops.length) {
        setLiveShops((currentShops) =>
          mergeUniqueShops(currentShops, changedShops),
        );
      }

      orderDeltaSinceRef.current = nextCheckpoint;
    } catch {
      // Delta refresh is opportunistic; the next realtime event, focus, or manual navigation retries it.
    } finally {
      isDeltaRefreshPendingRef.current = false;
    }
  }, [initialOrders, salesPersonId, selectedArea, selectedDate]);

  useEffect(() => {
    if (!initialOrders) {
      return;
    }

    const handleRefresh = () => {
      void refreshChangedOrders();
    };

    window.addEventListener("manish:sales-orders-delta", handleRefresh);

    return () => {
      window.removeEventListener("manish:sales-orders-delta", handleRefresh);
    };
  }, [initialOrders, refreshChangedOrders]);

  async function loadFullOrder(order: LocalOrder) {
    if (!initialOrders || order.items.length) {
      return order;
    }

    const orderRead = await readSupabaseOrderWithShop(
      createSupabaseBrowserClient(),
      order.id,
    );
    const fullOrder = orderRead.order;

    if (!fullOrder) {
      return null;
    }

    setLiveOrders((currentOrders) =>
      currentOrders
        ? currentOrders.map((currentOrder) =>
            currentOrder.id === fullOrder.id ? fullOrder : currentOrder,
          )
        : currentOrders,
    );

    const fullShop = orderRead.shop;

    if (fullShop) {
      setLiveShops((currentShops) =>
        mergeUniqueShops(currentShops, [fullShop]),
      );
    }

    return fullOrder;
  }

  async function loadProductSkusForEdit() {
    if (loadedProductSkus) {
      return loadedProductSkus;
    }

    const skus = await readCachedSupabaseProductSkus(
      createSupabaseBrowserClient(),
    );
    setLoadedProductSkus(skus);
    return skus;
  }

  async function handleViewOrder(order: LocalOrder) {
    setLoadingOrderId(order.id);
    setEditMessage("");

    try {
      const fullOrder = await loadFullOrder(order);

      if (!fullOrder) {
        setEditMessage("Order details could not be found.");
        return;
      }

      setSelectedOrder(fullOrder);
    } catch (error) {
      setEditMessage(
        error instanceof Error
          ? error.message
          : "Unable to load order details.",
      );
    } finally {
      setLoadingOrderId(null);
    }
  }

  async function handleStartEdit(order: LocalOrder) {
    if (!canSalesEditOrder(order)) {
      setEditMessage(
        "Sales orders can be edited until 11:59 pm on the day they are created.",
      );
      return;
    }

    setEditMessage("");
    setLoadingOrderId(order.id);

    try {
      const [fullOrder] = await Promise.all([
        loadFullOrder(order),
        initialOrders
          ? loadProductSkusForEdit()
          : Promise.resolve(loadedProductSkus),
      ]);

      if (!fullOrder) {
        setEditMessage("Order details could not be found.");
        return;
      }

      setEditingOrder(fullOrder);
    } catch (error) {
      setEditMessage(
        error instanceof Error ? error.message : "Unable to open order edit.",
      );
    } finally {
      setLoadingOrderId(null);
    }
  }

  function handleEdited() {
    setSelectedOrder(null);
    setEditingOrder(null);
    setLocalRefreshKey((value) => value + 1);
  }

  async function handleLoadMoreOrders() {
    if (!selectedDate || !nextOrderCursor) {
      return;
    }

    const range = getUtcRangeForIndiaDate(selectedDate);
    setIsLoadingNextOrders(true);
    setDateMessage("");

    try {
      const ordersRead = await readOrdersPage({
        salesPersonId,
        area: selectedArea === "all" ? undefined : selectedArea,
        createdAtFrom: range.start,
        createdAtTo: range.end,
        cursor: nextOrderCursor,
        limit: salesOrderPageSize,
        includeSummary: false,
      });

      setLiveOrders((currentOrders) =>
        mergeOrderPage(currentOrders || [], ordersRead.orders),
      );
      setLiveShops((currentShops) =>
        mergeUniqueShops(currentShops, ordersRead.shops),
      );
      setNextOrderCursor(ordersRead.nextCursor);
    } catch (error) {
      setDateMessage(
        error instanceof Error ? error.message : "Unable to load more orders.",
      );
    } finally {
      setIsLoadingNextOrders(false);
    }
  }

  async function handleSharePdf() {
    const areaLabel = selectedArea === "all" ? "All areas" : selectedArea;
    const areaFileLabel =
      selectedArea === "all" ? "all-area" : fileSafe(areaLabel);
    const timeLabel =
      timeFrom || timeTo ? `${timeFrom || "Start"} to ${timeTo || "End"}` : "";
    const filename = `${personFileSafe(salesPersonName)}-orders_${areaFileLabel}_${fileSafe(formatDateForDisplay(selectedDate))}.pdf`;
    let exportOrders = visibleOrders;
    let exportShops = displayShops;

    if (initialOrders && selectedDate) {
      setIsLoadingDate(true);

      try {
        const range = getUtcRangeForIndiaDate(selectedDate);
        const ordersRead = await readSupabaseOrdersWithShops(
          createSupabaseBrowserClient(),
          {
            salesPersonId,
            area: selectedArea === "all" ? undefined : selectedArea,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            ascending: true,
          },
        );
        exportShops = mergeUniqueShops(displayShops, ordersRead.shops);
        const exportShopById = new Map(
          exportShops.map((shop) => [shop.id, shop]),
        );
        exportOrders = ordersRead.orders
          .filter((order) => {
            const orderTime = getIndiaTimeValue(order.createdAt);
            return (
              (!timeFrom || orderTime >= timeFrom) &&
              (!timeTo || orderTime <= timeTo)
            );
          })
          .filter(
            (order) =>
              selectedArea === "all" ||
              exportShopById.get(order.shopId)?.area === selectedArea,
          );
      } finally {
        setIsLoadingDate(false);
      }
    }

    const { buildOrdersPdf } = await import("@/lib/pdf/orders-report");
    const pdfBlob = buildOrdersPdf({
      orders: exportOrders,
      shops: exportShops,
      titleParts: [
        salesPersonName,
        areaLabel,
        formatDateForDisplay(selectedDate),
        timeLabel,
      ].filter(Boolean),
    });
    const file = new File([pdfBlob], filename, { type: "application/pdf" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: "Manish Masala Orders",
          text: "Order details",
          files: [file],
        });
        setShareMessage("PDF shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    downloadBlob(pdfBlob, filename);
    setShareMessage(
      "PDF sharing is unavailable on this device. The file was downloaded instead.",
    );
  }

  return (
    <section
      id="orders"
      className="scroll-mt-32 space-y-4"
      aria-labelledby="my-orders-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="my-orders-title"
              className="text-2xl font-bold text-stone-900"
            >
              My Orders
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Updated orders are marked for admin review. Pending sync orders
              upload when the network returns.
            </p>
          </div>
          <button
            type="button"
            disabled={!visibleOrders.length}
            onClick={handleSharePdf}
            className="hidden items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300 sm:inline-flex"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            Share PDF
          </button>
        </div>
        <div className="mt-5 grid items-end gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">Area</span>
            <select
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All areas</option>
              {areaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">Date</span>
            <input
              type="date"
              max={today}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <fieldset className="min-w-0">
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="text-xs font-semibold text-stone-600">
                  From Time
                </span>
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(event) => setTimeFrom(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold text-stone-600">
                  To Time
                </span>
                <input
                  type="time"
                  value={timeTo}
                  onChange={(event) => setTimeTo(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </label>
            </div>
          </fieldset>
          <button
            type="button"
            disabled={!visibleOrders.length}
            onClick={handleSharePdf}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300 sm:hidden"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            Share PDF
          </button>
        </div>
        {shareMessage ? (
          <p className="mt-3 text-sm text-stone-600" role="status">
            {shareMessage}
          </p>
        ) : null}
        {isLoadingDate || dateMessage ? (
          <p className="mt-3 text-sm text-stone-600" role="status">
            {isLoadingDate ? "Loading selected order date..." : dateMessage}
          </p>
        ) : null}
        {editMessage ? (
          <p className="mt-3 text-sm text-orange-800" role="status">
            {editMessage}
          </p>
        ) : null}
      </div>

      {visibleOrders.length ? (
        <div className="overflow-auto rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {visibleOrders.length} loaded order
              {visibleOrders.length === 1 ? "" : "s"}.
            </span>
          </div>
          <table className="table-fixed w-full text-left text-xs sm:text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <th className="w-10 px-2 py-2 font-bold sm:w-12 sm:px-3 sm:py-3">
                  No.
                </th>
                <th className="w-20 px-2 py-2 font-bold sm:px-3 sm:py-3">
                  Status
                </th>
                <th className="w-32 px-2 py-2 font-bold sm:px-3 sm:py-3">
                  Shop
                </th>
                <th className="w-32 px-2 py-2 font-bold sm:px-3 sm:py-3">
                  Area
                </th>
                <th className="w-28 px-2 py-2 font-bold sm:px-3 sm:py-3">
                  Salesperson
                </th>
                <th className="w-32 px-2 py-2 font-bold sm:px-3 sm:py-3">
                  Date
                </th>
                <th className="w-20 px-2 py-2 text-right font-bold sm:w-24 sm:px-3 sm:py-3">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order, index) => {
                const shop = shopById.get(order.shopId);
                const shopName = shop?.name || "Unknown shop";
                const canEdit = mutationUiEnabled && canSalesEditOrder(order);

                return (
                  <tr
                    key={order.id}
                    className="border-t border-stone-200 transition-colors hover:bg-stone-50"
                  >
                    <td className="px-2 py-2 text-center font-bold text-stone-700 sm:px-3 sm:py-3">
                      {index + 1}
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-3">
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            order.status === "updated"
                              ? "bg-red-100 text-red-800"
                              : order.status === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {order.status}
                        </span>
                        {order.orderType === "adhoc" ? (
                          <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-bold text-amber-800">
                            adhoc
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-medium break-words text-stone-900 sm:px-3 sm:py-3">
                      {shopName}
                    </td>
                    <td className="px-2 py-2 break-words text-stone-700 sm:px-3 sm:py-3">
                      {shop?.area || "Unknown area"}
                    </td>
                    <td className="px-2 py-2 break-words text-stone-700 sm:px-3 sm:py-3">
                      {salesPersonName}
                    </td>
                    <td className="px-2 py-2 break-words text-stone-700 sm:px-3 sm:py-3">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-3">
                      <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:justify-end sm:gap-2">
                        <button
                          type="button"
                          disabled={loadingOrderId !== null}
                          onClick={() => void handleViewOrder(order)}
                          className="rounded-lg border border-stone-300 bg-white px-2 py-1 font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 disabled:cursor-wait disabled:border-stone-300 disabled:bg-white disabled:text-stone-400 sm:px-3 sm:py-2"
                        >
                          {loadingOrderId === order.id ? "Loading" : "View"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            !shop || !canEdit || loadingOrderId !== null
                          }
                          onClick={() => void handleStartEdit(order)}
                          className="rounded-lg border border-stone-300 bg-white px-2 py-1 font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-white disabled:text-stone-400 sm:px-3 sm:py-2"
                        >
                          {loadingOrderId === order.id ? "Loading" : "Edit"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-end">
            {nextOrderCursor ? (
              <button
                type="button"
                disabled={isLoadingDate || isLoadingNextOrders}
                onClick={() => void handleLoadMoreOrders()}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-orange-200 px-3 py-1.5 font-bold text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-wait disabled:text-stone-500"
              >
                {isLoadingNextOrders ? "Loading..." : "Load next 100"}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <FileText
            className="mx-auto h-8 w-8 text-stone-400"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-bold text-stone-900">
            No orders found
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            Try changing the area, date, or time filters.
          </p>
        </div>
      )}

      {selectedOrder ? (
        <OrderDetailPanel
          order={selectedOrder}
          shopName={shopById.get(selectedOrder.shopId)?.name || "Unknown shop"}
          subtitle={formatDateTime(selectedOrder.createdAt)}
          onClose={() => setSelectedOrder(null)}
        />
      ) : null}

      {editingOrder &&
      shopById.get(editingOrder.shopId) &&
      (!initialOrders || loadedProductSkus) ? (
        <LocalOrderEntry
          shop={shopById.get(editingOrder.shopId)!}
          salesPersonId={salesPersonId}
          productSkus={loadedProductSkus || undefined}
          activeTargetProgress={activeTargetProgress}
          existingOrder={editingOrder}
          canSaveExistingOrder={() => canSalesEditOrder(editingOrder)}
          persistenceEnabled={writesEnabled}
          onClose={() => setEditingOrder(null)}
          onSaved={handleEdited}
        />
      ) : null}
    </section>
  );
}
