"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Edit3,
  Eye,
  FileText,
  MapPin,
  Trash2,
} from "lucide-react";
import { OrderDetailPanel } from "@/features/orders/order-detail-panel";
import { LocalOrderEntry } from "@/features/sales/local-order-entry";
import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  getIndiaDate,
  getUtcRangeForIndiaDate,
  getUtcRangeForIndiaDateRange,
} from "@/lib/dates/india";
import { downloadBlob, fileSafe, personFileSafe } from "@/lib/browser/download";
import { readLocalOrders } from "@/lib/local/orders";
import { readLocalShops } from "@/lib/local/shops";
import { readLocalUsers } from "@/lib/local/users";
import { getGoogleMapsDirectionsUrl } from "@/lib/maps/google";
import { buildUserNameMap, getSalespersonName } from "@/lib/users/display";
import { deleteCoreOrderPermanently } from "@/lib/sync/core-mutations";
import { getUnsyncedOrders } from "@/lib/sync/core-outbox";
import { readOrdersPage } from "@/lib/admin/paged-read-api";
import { createOffsetCursor } from "@/lib/repositories/read-pagination";
import {
  mergeUniqueShops,
  readSupabaseOrderListWithShops,
  readSupabaseOrderWithShop,
  readSupabaseOrdersWithShops,
} from "@/lib/repositories/supabase-read";
import { readCachedSupabaseProductSkus } from "@/lib/products/supabase-product-sku-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  AppRole,
  LocalOrder,
  LocalProductSku,
  SalesRouteShop,
  UserProfile,
} from "@/types/domain";

type AdminOrdersProps = {
  role: Extract<AppRole, "admin" | "manager">;
  actorId: string;
  initialOrders?: LocalOrder[];
  initialShops?: SalesRouteShop[];
  initialAreaOptions?: string[];
  initialUsers?: UserProfile[];
  initialProductSkus?: LocalProductSku[];
  initialOrderSummary?: {
    total: number;
    updated: number;
    adhoc: number;
  };
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

const adminOrderPageSize = 100;
const deltaOverlapMs = 5_000;

function getDeltaCheckpoint() {
  return new Date(Date.now() - deltaOverlapMs).toISOString();
}

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

function fileDate(value: string) {
  return fileSafe(formatDateForDisplay(value));
}

function formatPdfDateOnly(value: string) {
  return formatDateForDisplay(value);
}

function matchesSearch(
  order: LocalOrder,
  shop: SalesRouteShop | undefined,
  salespersonName: string,
  searchValue: string,
) {
  const value = searchValue.trim().toLowerCase();

  if (!value) {
    return true;
  }

  return [
    shop?.name,
    shop?.area,
    salespersonName,
    order.orderType,
    order.status,
  ]
    .filter(Boolean)
    .some((item) => item?.toLowerCase().includes(value));
}

function getUnknownShopLabel(order: LocalOrder) {
  return order.shopId ? `Shop ID: ${order.shopId}` : "Shop ID missing";
}

function mergeOrdersForAdmin(initialOrders: LocalOrder[] | undefined, localOrders: LocalOrder[]) {
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

export function AdminOrders({
  role,
  actorId,
  initialOrders,
  initialShops,
  initialAreaOptions,
  initialUsers,
  initialProductSkus,
  initialOrderSummary,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: AdminOrdersProps) {
  const today = getIndiaDateValue(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSalesperson, setSelectedSalesperson] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<LocalOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<LocalOrder | null>(null);
  const [productSkus, setProductSkus] = useState<LocalProductSku[] | null>(
    () => initialProductSkus || null,
  );
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deletedOrderIds, setDeletedOrderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [nextOrderCursor, setNextOrderCursor] = useState<string | null>(
    () =>
      initialOrders && initialOrders.length > adminOrderPageSize
        ? createOffsetCursor(adminOrderPageSize)
        : null,
  );
  const [isLoadingNextOrders, setIsLoadingNextOrders] = useState(false);
  const [liveOrders, setLiveOrders] = useState<LocalOrder[] | null>(
    () => initialOrders?.slice(0, adminOrderPageSize) || null,
  );
  const [liveShops, setLiveShops] = useState<SalesRouteShop[]>([]);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [rangeMessage, setRangeMessage] = useState("");
  const [serverOrderSummary, setServerOrderSummary] = useState<{
    total: number;
    updated: number;
    adhoc: number;
  } | null>(() => initialOrderSummary || null);
  const didSkipInitialRangeReadRef = useRef(false);
  const orderDeltaSinceRef = useRef(getDeltaCheckpoint());
  const isDeltaRefreshPendingRef = useRef(false);
  const shops = useMemo(
    () => mergeUniqueShops(initialShops || readLocalShops(refreshKey), liveShops),
    [initialShops, liveShops, refreshKey],
  );
  const hasDateRange = Boolean(dateFrom || dateTo);
  const liveOrderSource = liveOrders ?? initialOrders;
  const orders = useMemo(
    () =>
      mergeOrdersForAdmin(
        liveOrderSource,
        liveOrderSource ? [] : readLocalOrders(refreshKey),
      ).filter((order) => !deletedOrderIds.has(order.id)),
    [deletedOrderIds, liveOrderSource, refreshKey],
  );
  const users = initialUsers || readLocalUsers(refreshKey);
  const shopById = useMemo(
    () => new Map(shops.map((shop) => [shop.id, shop])),
    [shops],
  );
  const userNameById = useMemo(() => buildUserNameMap(users), [users]);
  const salespersonOptions = useMemo(
    () =>
      users
        .filter((user) => user.role === "sales" && user.active)
        .map((user) => user.id)
        .sort((a, b) =>
          getSalespersonName(userNameById, a).localeCompare(
            getSalespersonName(userNameById, b),
          ),
        ),
    [userNameById, users],
  );
  const areaOptions = useMemo(
    () => initialAreaOptions || Array.from(new Set(shops.map((shop) => shop.area))).sort(),
    [initialAreaOptions, shops],
  );
  const filterAndSortOrders = useCallback(
    (
      sourceOrders: LocalOrder[],
      sourceShopById: Map<string, SalesRouteShop>,
    ) => {
      const hasDateRange = Boolean(dateFrom || dateTo);

      return sourceOrders
        .filter((order) => {
          const shop = sourceShopById.get(order.shopId);
          const salespersonName = getSalespersonName(
            userNameById,
            order.salesPersonId,
          );
          const orderDate = getIndiaDateValue(order.createdAt);
          const orderTime = getIndiaTimeValue(order.createdAt);
          const salespersonMatches =
            selectedSalesperson === "all" ||
            order.salesPersonId === selectedSalesperson;
          const areaMatches =
            selectedArea === "all" || shop?.area === selectedArea;
          const exactDateMatches =
            hasDateRange || !selectedDate || orderDate === selectedDate;
          const fromDateMatches = !dateFrom || orderDate >= dateFrom;
          const toDateMatches = !dateTo || orderDate <= dateTo;
          const fromTimeMatches = !timeFrom || orderTime >= timeFrom;
          const toTimeMatches = !timeTo || orderTime <= timeTo;

          return (
            salespersonMatches &&
            areaMatches &&
            exactDateMatches &&
            fromDateMatches &&
            toDateMatches &&
            fromTimeMatches &&
            toTimeMatches &&
            matchesSearch(order, shop, salespersonName, searchValue)
          );
        })
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
    },
    [
      dateFrom,
      dateTo,
      searchValue,
      selectedArea,
      selectedDate,
      selectedSalesperson,
      timeFrom,
      timeTo,
      userNameById,
    ],
  );
  const visibleOrders = useMemo(
    () => filterAndSortOrders(orders, shopById),
    [filterAndSortOrders, orders, shopById],
  );
  const loadedOrderSummary = useMemo(
    () => ({
      total: visibleOrders.length,
      updated: visibleOrders.filter((order) => order.status === "updated").length,
      adhoc: visibleOrders.filter((order) => order.orderType === "adhoc").length,
    }),
    [visibleOrders],
  );
  const canUseServerOrderSummary = Boolean(
    initialOrders &&
      !searchValue &&
      !timeFrom &&
      !timeTo &&
      (hasDateRange || selectedDate),
  );
  const orderSummary =
    canUseServerOrderSummary && serverOrderSummary
      ? serverOrderSummary
      : loadedOrderSummary;
  const canShowMutations = role === "admin";
  const canMutate = role === "admin" && writesEnabled;
  const canOpenMutationUi = role === "admin" && mutationUiEnabled;

  useEffect(() => {
    if (!initialOrders) {
      return;
    }

    if (!didSkipInitialRangeReadRef.current) {
      didSkipInitialRangeReadRef.current = true;
      return;
    }

    const range = hasDateRange
      ? getUtcRangeForIndiaDateRange(dateFrom, dateTo)
      : selectedDate
        ? getUtcRangeForIndiaDate(selectedDate)
        : null;

    if (!range) {
      const timeoutId = window.setTimeout(() => {
        setLiveOrders([]);
        setLiveShops([]);
        setNextOrderCursor(null);
        setRangeMessage("Select a date or date range to load orders.");
      });

      return () => window.clearTimeout(timeoutId);
    }

    let isActive = true;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingRange(true);
      setRangeMessage("");
      const shouldUsePagedRead = !timeFrom && !timeTo;

      const readPromise = shouldUsePagedRead
        ? readOrdersPage({
            salesPersonId:
              selectedSalesperson === "all" ? undefined : selectedSalesperson,
            area: selectedArea === "all" ? undefined : selectedArea,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            limit: adminOrderPageSize,
          })
        : readSupabaseOrderListWithShops(createSupabaseBrowserClient(), {
            salesPersonId:
              selectedSalesperson === "all" ? undefined : selectedSalesperson,
            area: selectedArea === "all" ? undefined : selectedArea,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            ascending: true,
          }).then((ordersRead) => ({
            orders: ordersRead.orders,
            shops: ordersRead.shops,
            summary: null,
            nextCursor: null,
          }));

      readPromise
        .then((ordersRead) => {
          if (!isActive) {
            return;
          }

          setLiveOrders(ordersRead.orders);
          setLiveShops(ordersRead.shops);
          setNextOrderCursor(shouldUsePagedRead ? ordersRead.nextCursor : null);
          if (ordersRead.summary) {
            setServerOrderSummary(ordersRead.summary);
          }
          orderDeltaSinceRef.current = getDeltaCheckpoint();
          setRangeMessage("");
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          setRangeMessage(
            error instanceof Error ? error.message : "Unable to load orders.",
          );
        })
        .finally(() => {
          if (isActive) {
            setIsLoadingRange(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    dateFrom,
    dateTo,
    hasDateRange,
    initialOrders,
    selectedArea,
    selectedDate,
    selectedSalesperson,
    timeFrom,
    timeTo,
  ]);

  const refreshChangedOrders = useCallback(async () => {
    if (
      !initialOrders ||
      isDeltaRefreshPendingRef.current ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    ) {
      return;
    }

    const range = hasDateRange
      ? getUtcRangeForIndiaDateRange(dateFrom, dateTo)
      : selectedDate
        ? getUtcRangeForIndiaDate(selectedDate)
        : null;

    if (!range) {
      return;
    }

    const nextCheckpoint = getDeltaCheckpoint();
    let cursor: string | null = null;
    let changedOrders: LocalOrder[] = [];
    let changedShops: SalesRouteShop[] = [];
    isDeltaRefreshPendingRef.current = true;

    try {
      for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
        const ordersRead = await readOrdersPage({
          salesPersonId:
            selectedSalesperson === "all" ? undefined : selectedSalesperson,
          area: selectedArea === "all" ? undefined : selectedArea,
          createdAtFrom: range.start,
          createdAtTo: range.end,
          updatedAtFrom: orderDeltaSinceRef.current,
          cursor,
          limit: adminOrderPageSize,
          includeSummary: pageIndex === 0 && canUseServerOrderSummary,
        });

        changedOrders = mergeOrderPage(changedOrders, ordersRead.orders);
        changedShops = mergeUniqueShops(changedShops, ordersRead.shops);
        cursor = ordersRead.nextCursor;

        if (pageIndex === 0 && ordersRead.summary) {
          setServerOrderSummary(ordersRead.summary);
        }

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
        setLiveShops((currentShops) => mergeUniqueShops(currentShops, changedShops));
      }

      orderDeltaSinceRef.current = nextCheckpoint;
      setRangeMessage("");
    } catch (error) {
      setRangeMessage(
        error instanceof Error ? error.message : "Unable to refresh orders.",
      );
    } finally {
      isDeltaRefreshPendingRef.current = false;
    }
  }, [
    canUseServerOrderSummary,
    dateFrom,
    dateTo,
    hasDateRange,
    initialOrders,
    selectedArea,
    selectedDate,
    selectedSalesperson,
  ]);

  useEffect(() => {
    if (!initialOrders) {
      return;
    }

    const handleRefresh = () => {
      void refreshChangedOrders();
    };

    window.addEventListener("manish:admin-orders-delta", handleRefresh);

    return () => {
      window.removeEventListener("manish:admin-orders-delta", handleRefresh);
    };
  }, [initialOrders, refreshChangedOrders]);

  function resetOrderPage() {
    setNextOrderCursor(null);
  }

  function handleSelectedDateChange(value: string) {
    resetOrderPage();
    setSelectedDate(value);
    if (value) {
      setDateFrom("");
      setDateTo("");
    }
  }

  function handleDateFromChange(value: string) {
    resetOrderPage();
    setDateFrom(value);
    if (value || dateTo) {
      setSelectedDate("");
    }
  }

  function handleDateToChange(value: string) {
    resetOrderPage();
    setDateTo(value);
    if (value || dateFrom) {
      setSelectedDate("");
    }
  }

  async function handleDelete(order: LocalOrder) {
    if (
      !window.confirm(
        "Permanently delete this order and all its product items? This cannot be undone.",
      )
    ) {
      return;
    }

    setDeletingOrderId(order.id);

    try {
      await deleteCoreOrderPermanently(order.id);
      setDeletedOrderIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(order.id);
        return nextIds;
      });
      setSelectedOrder(null);
      setEditingOrder(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown database error.";
      window.alert(`Order could not be deleted: ${message}`);
    } finally {
      setDeletingOrderId(null);
    }
  }

  function handleEdited() {
    setEditingOrder(null);
    setRefreshKey((value) => value + 1);
  }

  async function loadFullOrder(order: LocalOrder) {
    if (!initialOrders || order.items.length) {
      return order;
    }

    const supabase = createSupabaseBrowserClient();
    const orderRead = await readSupabaseOrderWithShop(supabase, order.id);

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
      setLiveShops((currentShops) => mergeUniqueShops(currentShops, [fullShop]));
    }

    return fullOrder;
  }

  async function loadProductSkusForEdit() {
    if (productSkus) {
      return productSkus;
    }

    const supabase = createSupabaseBrowserClient();
    const skus = await readCachedSupabaseProductSkus(supabase);
    setProductSkus(skus);
    return skus;
  }

  async function handleViewOrder(order: LocalOrder) {
    setLoadingOrderId(order.id);

    try {
      const fullOrder = await loadFullOrder(order);

      if (!fullOrder) {
        window.alert("Order details could not be found.");
        return;
      }

      setSelectedOrder(fullOrder);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load order details.";
      window.alert(`Order details could not be loaded: ${message}`);
    } finally {
      setLoadingOrderId(null);
    }
  }

  async function handleEditOrder(order: LocalOrder) {
    setLoadingOrderId(order.id);

    try {
      const [fullOrder] = await Promise.all([
        loadFullOrder(order),
        initialOrders ? loadProductSkusForEdit() : Promise.resolve(productSkus),
      ]);

      if (!fullOrder) {
        window.alert("Order details could not be found.");
        return;
      }

      setEditingOrder(fullOrder);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load order edit data.";
      window.alert(`Order edit could not be opened: ${message}`);
    } finally {
      setLoadingOrderId(null);
    }
  }

  async function handleLoadMoreOrders() {
    const range = hasDateRange
      ? getUtcRangeForIndiaDateRange(dateFrom, dateTo)
      : selectedDate
        ? getUtcRangeForIndiaDate(selectedDate)
        : null;

    if (!range || !nextOrderCursor) {
      return;
    }

    setIsLoadingNextOrders(true);
    setRangeMessage("");

    try {
      const ordersRead = await readOrdersPage({
        salesPersonId:
          selectedSalesperson === "all" ? undefined : selectedSalesperson,
        area: selectedArea === "all" ? undefined : selectedArea,
        createdAtFrom: range.start,
        createdAtTo: range.end,
        cursor: nextOrderCursor,
        limit: adminOrderPageSize,
        includeSummary: false,
      });

      setLiveOrders((currentOrders) =>
        mergeOrderPage(currentOrders || [], ordersRead.orders),
      );
      setLiveShops((currentShops) => mergeUniqueShops(currentShops, ordersRead.shops));
      setNextOrderCursor(ordersRead.nextCursor);
    } catch (error) {
      setRangeMessage(
        error instanceof Error ? error.message : "Unable to load more orders.",
      );
    } finally {
      setIsLoadingNextOrders(false);
    }
  }

  async function handleExportPdf() {
    const salespersonLabel =
      selectedSalesperson === "all"
        ? role === "admin"
          ? "admin"
          : "Manager"
        : getSalespersonName(userNameById, selectedSalesperson);
    const salespersonFileLabel =
      selectedSalesperson === "all"
        ? fileSafe(salespersonLabel)
        : personFileSafe(salespersonLabel);
    const areaLabel = selectedArea === "all" ? "All areas" : selectedArea;
    const areaFileLabel = selectedArea === "all" ? "all-area" : fileSafe(areaLabel);
    const titleDate = hasDateRange
      ? `${dateFrom ? formatPdfDateOnly(dateFrom) : "Start"} to ${
          dateTo ? formatPdfDateOnly(dateTo) : "End"
        }`
      : selectedDate
        ? formatPdfDateOnly(selectedDate)
        : "All dates";
    const fileDateLabel = hasDateRange
      ? `${dateFrom ? fileDate(dateFrom) : "start"}_to_${dateTo ? fileDate(dateTo) : "end"}`
      : selectedDate
        ? fileDate(selectedDate)
        : "all-dates";
    const timeLabel =
      timeFrom || timeTo ? `${timeFrom || "Start"} to ${timeTo || "End"}` : "";
    let exportOrders = visibleOrders;
    let exportShops = shops;
    const range = hasDateRange
      ? getUtcRangeForIndiaDateRange(dateFrom, dateTo)
      : selectedDate
        ? getUtcRangeForIndiaDate(selectedDate)
        : null;

    if (initialOrders && range) {
      setIsLoadingRange(true);

      try {
        const supabase = createSupabaseBrowserClient();
        const ordersRead = await readSupabaseOrdersWithShops(supabase, {
          salesPersonId:
            selectedSalesperson === "all" ? undefined : selectedSalesperson,
          area: selectedArea === "all" ? undefined : selectedArea,
          createdAtFrom: range.start,
          createdAtTo: range.end,
          ascending: true,
        });
        exportShops = mergeUniqueShops(shops, ordersRead.shops);
        const exportShopById = new Map(exportShops.map((shop) => [shop.id, shop]));
        exportOrders = filterAndSortOrders(ordersRead.orders, exportShopById);
      } finally {
        setIsLoadingRange(false);
      }
    }

    const { buildOrdersPdf } = await import("@/lib/pdf/orders-report");
    const pdfBlob = buildOrdersPdf({
      orders: exportOrders,
      shops: exportShops,
      titleParts: [salespersonLabel, areaLabel, titleDate, timeLabel].filter(
        Boolean,
      ),
    });

    downloadBlob(
      pdfBlob,
      `${salespersonFileLabel}-orders_${areaFileLabel}_${fileDateLabel}.pdf`,
    );
  }

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="admin-orders-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-700">
              Central review
            </p>
            <h2
              id="admin-orders-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              Orders
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Local route and adhoc order review with filters, details, map
              links, and admin edit controls.
            </p>
          </div>
          <div className="grid gap-2 grid-cols-3 lg:min-w-96">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">
                {hasDateRange ? "Orders" : selectedDate === today ? "Today" : "Orders"}
              </p>
              <p className="mt-1 text-xl font-bold text-stone-900">
                {orderSummary.total}
              </p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-orange-700">
                Updated
              </p>
              <p className="mt-1 text-xl font-bold text-orange-800">
                {orderSummary.updated}
              </p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-sky-700">
                Adhoc
              </p>
              <p className="mt-1 text-xl font-bold text-sky-800">
                {orderSummary.adhoc}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_160px]">
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Search</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
              placeholder="Shop, area, salesperson"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">
              Salesperson
            </span>
            <select
              value={selectedSalesperson}
              onChange={(event) => {
                resetOrderPage();
                setSelectedSalesperson(event.target.value);
              }}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All</option>
              {salespersonOptions.map((salespersonId) => (
                <option key={salespersonId} value={salespersonId}>
                  {getSalespersonName(userNameById, salespersonId)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">Area</span>
            <select
              value={selectedArea}
              onChange={(event) => {
                resetOrderPage();
                setSelectedArea(event.target.value);
              }}
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
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => handleSelectedDateChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Date from
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => handleDateFromChange(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Date to
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => handleDateToChange(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Time from
            </span>
            <input
              type="time"
              value={timeFrom}
              onChange={(event) => {
                resetOrderPage();
                setTimeFrom(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Time to
            </span>
            <input
              type="time"
              value={timeTo}
              onChange={(event) => {
                resetOrderPage();
                setTimeTo(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
        </div>
        <div className="mt-3 flex sm:justify-end">
          <button
            type="button"
            disabled={!visibleOrders.length}
            onClick={handleExportPdf}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Export PDF
          </button>
        </div>
        {isLoadingRange || rangeMessage ? (
          <p className="mt-3 text-sm font-semibold text-stone-600">
            {isLoadingRange ? "Loading selected order range..." : rangeMessage}
          </p>
        ) : null}
      </div>

      {visibleOrders.length ? (
        <div className="max-w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {visibleOrders.length} loaded order{visibleOrders.length === 1 ? "" : "s"}.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-left text-sm">
              <thead className="bg-stone-100 text-stone-700">
                <tr>
                  <th className="min-w-16 px-3 py-2 text-left">No</th>
                  <th className="min-w-32 px-3 py-2">Status</th>
                  <th className="min-w-56 px-3 py-2">Shop</th>
                  <th className="min-w-48 px-3 py-2">Area</th>
                  <th className="min-w-48 px-3 py-2">Salesperson</th>
                  <th className="min-w-40 px-3 py-2">Date/Time</th>
                  <th className="min-w-64 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order, index) => {
                  const shop = shopById.get(order.shopId);
                  const mapUrl =
                    order.visitLat !== null && order.visitLng !== null
                      ? getGoogleMapsDirectionsUrl(
                          order.visitLat,
                          order.visitLng,
                        )
                      : null;

                  return (
                    <tr key={order.id} className="border-t border-stone-200 transition-colors hover:bg-stone-50">
                      <td className="px-3 py-2 text-right font-bold text-stone-900">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {order.status === "updated" ? (
                            <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
                              {order.status}
                            </span>
                          ) : (
                            <span className="rounded-md bg-[#e3f8ed] px-2 py-1 text-xs font-bold text-[#03543f]">
                              {order.status}
                            </span>
                          )}
                          {order.orderType === "adhoc" ? (
                            <span className="rounded-md bg-yellow-100 px-2 py-1 text-xs font-bold text-amber-800">
                              adhoc
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p className="max-w-72 whitespace-normal font-bold break-words text-slate-900">
                          {shop?.name || "Unknown shop"}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="max-w-64 whitespace-normal break-words text-slate-600">
                          {shop?.area || getUnknownShopLabel(order)}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="max-w-56 whitespace-normal break-words text-slate-600">
                          {getSalespersonName(
                            userNameById,
                            order.salesPersonId,
                          )}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={loadingOrderId !== null}
                            onClick={() => void handleViewOrder(order)}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-2 py-1 font-bold whitespace-nowrap text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-500"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            {loadingOrderId === order.id ? "Loading..." : "View"}
                          </button>
                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 font-bold whitespace-nowrap text-slate-700 hover:bg-slate-50"
                            >
                              <MapPin className="h-4 w-4" aria-hidden="true" />
                              Map
                            </a>
                          ) : null}
                          {canShowMutations ? (
                            <button
                              type="button"
                              disabled={!canOpenMutationUi || !shop || loadingOrderId !== null}
                              onClick={() => void handleEditOrder(order)}
                              className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-2 py-1 font-bold whitespace-nowrap text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                            >
                              <Edit3 className="h-4 w-4" aria-hidden="true" />
                              {loadingOrderId === order.id ? "Loading..." : "Edit"}
                            </button>
                          ) : null}
                          {canShowMutations ? (
                            <button
                              type="button"
                              disabled={!canMutate || deletingOrderId !== null}
                              onClick={() => void handleDelete(order)}
                              className="inline-flex items-center gap-2 rounded-md border border-red-200 px-2 py-1 font-bold whitespace-nowrap text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              {deletingOrderId === order.id ? "Deleting..." : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-end">
            {nextOrderCursor ? (
              <button
                type="button"
                disabled={isLoadingRange || isLoadingNextOrders}
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
            No local orders
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            Seed or create local orders to review them here.
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

      {editingOrder && shopById.get(editingOrder.shopId) && (!initialOrders || productSkus) ? (
        <LocalOrderEntry
          shop={shopById.get(editingOrder.shopId)!}
          salesPersonId={editingOrder.salesPersonId}
          productSkus={productSkus || undefined}
          actorId={actorId}
          existingOrder={editingOrder}
          persistenceEnabled={canMutate}
          onClose={() => setEditingOrder(null)}
          onSaved={handleEdited}
        />
      ) : null}
    </section>
  );
}
