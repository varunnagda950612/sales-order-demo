"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Edit3, Eye, FileText, Trash2, X } from "lucide-react";
import { LocalCollectionEntry } from "@/features/sales/local-collection-entry";
import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  getIndiaDate,
  getUtcRangeForIndiaDateRange,
} from "@/lib/dates/india";
import { downloadBlob, fileSafe, personFileSafe } from "@/lib/browser/download";
import {
  paymentModeLabels,
  readLocalCollections,
} from "@/lib/local/collections";
import { readLocalShops } from "@/lib/local/shops";
import { readLocalUsers } from "@/lib/local/users";
import type { CollectionPdfRow } from "@/lib/pdf/collections-report";
import { buildUserNameMap, getSalespersonName } from "@/lib/users/display";
import { deleteCoreCollectionPermanently } from "@/lib/sync/core-mutations";
import { getUnsyncedCollections } from "@/lib/sync/core-outbox";
import { readCollectionsPage } from "@/lib/admin/paged-read-api";
import { createOffsetCursor } from "@/lib/repositories/read-pagination";
import {
  mergeUniqueShops,
  readSupabaseCollectionsWithShops,
} from "@/lib/repositories/supabase-read";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  AppRole,
  LocalCollection,
  LocalCollectionBill,
  PaymentMode,
  SalesRouteShop,
  UserProfile,
} from "@/types/domain";

type AdminCollectionsProps = {
  role: Extract<AppRole, "admin" | "manager">;
  actorId: string;
  initialCollections?: LocalCollection[];
  initialCollectionRawRowCount?: number;
  initialCollectionSummary?: {
    rowCount: number;
    cash: number;
    cheque: number;
    upi: number;
    total: number;
  };
  initialShops?: SalesRouteShop[];
  initialAreaOptions?: string[];
  initialUsers?: UserProfile[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

type CollectionRow = {
  collection: LocalCollection;
  bill: LocalCollectionBill;
  shop: SalesRouteShop | undefined;
  salespersonName: string;
};

const paymentFilterOptions: Array<PaymentMode | "all"> = [
  "all",
  "cash",
  "cheque",
  "upi",
];
const adminCollectionPageSize = 100;
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

function getUnknownShopLabel(collection: LocalCollection) {
  return collection.shopId
    ? `Shop ID: ${collection.shopId}`
    : "Shop ID missing";
}

function getModeTotals(rows: CollectionRow[]) {
  return rows.reduce(
    (totals, row) => ({
      ...totals,
      [row.bill.paymentMode]: totals[row.bill.paymentMode] + row.bill.amount,
    }),
    { cash: 0, cheque: 0, upi: 0 },
  );
}

function mergeCollectionsForAdmin(
  initialCollections: LocalCollection[] | undefined,
  localCollections: LocalCollection[],
) {
  const collectionById = new Map<string, LocalCollection>();

  (initialCollections || localCollections).forEach((collection) => {
    collectionById.set(collection.id, collection);
  });

  getUnsyncedCollections().forEach((collection) => {
    collectionById.set(collection.id, collection);
  });

  return Array.from(collectionById.values());
}

function mergeCollectionPage(
  currentCollections: LocalCollection[],
  nextCollections: LocalCollection[],
) {
  const collectionById = new Map(currentCollections.map((collection) => [collection.id, collection]));

  nextCollections.forEach((collection) => {
    const existingCollection = collectionById.get(collection.id);

    if (!existingCollection) {
      collectionById.set(collection.id, collection);
      return;
    }

    const billById = new Map(existingCollection.bills.map((bill) => [bill.id, bill]));
    collection.bills.forEach((bill) => {
      billById.set(bill.id, bill);
    });

    collectionById.set(collection.id, {
      ...existingCollection,
      ...collection,
      bills: Array.from(billById.values()),
    });
  });

  return Array.from(collectionById.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function CollectionDetail({
  collection,
  shop,
  onClose,
}: {
  collection: LocalCollection;
  shop?: SalesRouteShop;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4">
      <section className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white p-3 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-sm font-semibold text-amber-700">
              {formatDateTime(collection.createdAt)}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {shop?.name || "Unknown shop"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {collection.collectionType === "adhoc" ? "Adhoc" : "Route"}{" "}
              collection - {collection.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Close collection detail"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {collection.bills.map((bill) => (
            <div key={bill.id} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Bill No.
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {bill.billNumber}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Bill Date
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatDateForDisplay(bill.billDate)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Mode
                </p>
                <div className="mt-1">
                  <p className="text-lg font-bold text-slate-900">
                    {paymentModeLabels[bill.paymentMode]}
                  </p>
                  {bill.chequeDate ? (
                    <p className="text-sm text-slate-600">
                      Chq: {formatDateForDisplay(bill.chequeDate)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Amount
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  Rs. {bill.amount.toFixed(2)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Discount
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  Rs. {bill.discount.toFixed(2)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Replacement
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  Rs. {bill.replacement.toFixed(2)}
                </p>
              </div>
              {bill.notes ? (
                <div className="col-span-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 sm:col-span-3">
                  <p className="text-xs font-semibold uppercase text-orange-700">Note</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-stone-900">
                    {bill.notes}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminCollections({
  role,
  actorId,
  initialCollections,
  initialCollectionRawRowCount,
  initialCollectionSummary,
  initialShops,
  initialAreaOptions,
  initialUsers,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: AdminCollectionsProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSalesperson, setSelectedSalesperson] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<
    PaymentMode | "all"
  >("all");
  const today = getIndiaDate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [selectedCollection, setSelectedCollection] =
    useState<LocalCollection | null>(null);
  const [editingCollection, setEditingCollection] =
    useState<LocalCollection | null>(null);
  const [deletedCollectionIds, setDeletedCollectionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(
    null,
  );
  const [nextCollectionCursor, setNextCollectionCursor] = useState<string | null>(
    () =>
      (initialCollectionRawRowCount || initialCollections?.length || 0) > adminCollectionPageSize
        ? createOffsetCursor(adminCollectionPageSize)
        : null,
  );
  const [isLoadingNextCollections, setIsLoadingNextCollections] = useState(false);
  const [liveCollections, setLiveCollections] = useState<LocalCollection[] | null>(
    () => initialCollections?.slice(0, adminCollectionPageSize) || null,
  );
  const [liveShops, setLiveShops] = useState<SalesRouteShop[]>([]);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [rangeMessage, setRangeMessage] = useState("");
  const [serverCollectionSummary, setServerCollectionSummary] = useState<{
    rowCount: number;
    cash: number;
    cheque: number;
    upi: number;
    total: number;
  } | null>(() => initialCollectionSummary || null);
  const didSkipInitialRangeReadRef = useRef(false);
  const collectionDeltaSinceRef = useRef(getDeltaCheckpoint());
  const isDeltaRefreshPendingRef = useRef(false);
  const shops = useMemo(
    () => mergeUniqueShops(initialShops || readLocalShops(refreshKey), liveShops),
    [initialShops, liveShops, refreshKey],
  );
  const liveCollectionSource = liveCollections ?? initialCollections;
  const collections = useMemo(
    () =>
      mergeCollectionsForAdmin(
        liveCollectionSource,
        liveCollectionSource ? [] : readLocalCollections(refreshKey),
      ),
    [liveCollectionSource, refreshKey],
  );
  const users = initialUsers || readLocalUsers(refreshKey);
  const shopById = useMemo(
    () => new Map(shops.map((shop) => [shop.id, shop])),
    [shops],
  );
  const userNameById = useMemo(() => buildUserNameMap(users), [users]);
  const rows = useMemo(
    () =>
      collections.flatMap((collection) =>
        collection.bills.map((bill) => ({
          collection,
          bill,
          shop: shopById.get(collection.shopId),
          salespersonName: getSalespersonName(
            userNameById,
            collection.salesPersonId,
          ),
        })),
      ),
    [collections, shopById, userNameById],
  );
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
  const filterAndSortRows = useCallback(
    (sourceRows: CollectionRow[]) =>
      sourceRows
        .filter((row) => !deletedCollectionIds.has(row.collection.id))
        .filter((row) => {
          const collectionDate = getIndiaDateValue(row.collection.createdAt);
          const collectionTime = getIndiaTimeValue(row.collection.createdAt);
          const salespersonMatches =
            selectedSalesperson === "all" ||
            row.collection.salesPersonId === selectedSalesperson;
          const areaMatches =
            selectedArea === "all" || row.shop?.area === selectedArea;
          const paymentMatches =
            selectedPaymentMode === "all" ||
            row.bill.paymentMode === selectedPaymentMode;
          const fromDateMatches = !dateFrom || collectionDate >= dateFrom;
          const toDateMatches = !dateTo || collectionDate <= dateTo;
          const fromTimeMatches = !timeFrom || collectionTime >= timeFrom;
          const toTimeMatches = !timeTo || collectionTime <= timeTo;

          return (
            salespersonMatches &&
            areaMatches &&
            paymentMatches &&
            fromDateMatches &&
            toDateMatches &&
            fromTimeMatches &&
            toTimeMatches
          );
        })
        .sort(
          (a, b) =>
            new Date(a.collection.createdAt).getTime() -
            new Date(b.collection.createdAt).getTime(),
        ),
    [
      dateFrom,
      dateTo,
      deletedCollectionIds,
      selectedArea,
      selectedPaymentMode,
      selectedSalesperson,
      timeFrom,
      timeTo,
    ],
  );
  const visibleRows = useMemo(
    () => filterAndSortRows(rows),
    [filterAndSortRows, rows],
  );
  const canUseServerCollectionSummary = Boolean(
    initialCollections && !timeFrom && !timeTo && (dateFrom || dateTo),
  );
  const loadedModeTotals = getModeTotals(visibleRows);
  const modeTotals =
    canUseServerCollectionSummary && serverCollectionSummary
      ? {
          cash: serverCollectionSummary.cash,
          cheque: serverCollectionSummary.cheque,
          upi: serverCollectionSummary.upi,
        }
      : loadedModeTotals;
  const loadedTotalAmount = visibleRows.reduce(
    (total, row) => total + row.bill.amount,
    0,
  );
  const totalAmount =
    canUseServerCollectionSummary && serverCollectionSummary
      ? serverCollectionSummary.total
      : loadedTotalAmount;
  const canShowMutations = role === "admin";
  const canMutate = role === "admin" && writesEnabled;
  const canOpenMutationUi = role === "admin" && mutationUiEnabled;

  useEffect(() => {
    if (!initialCollections) {
      return;
    }

    if (!didSkipInitialRangeReadRef.current) {
      didSkipInitialRangeReadRef.current = true;
      return;
    }

    const range = getUtcRangeForIndiaDateRange(dateFrom, dateTo);

    if (!range.start && !range.end) {
      const timeoutId = window.setTimeout(() => {
        setLiveCollections([]);
        setLiveShops([]);
        setNextCollectionCursor(null);
        setRangeMessage("Select a date range to load collections.");
      });

      return () => window.clearTimeout(timeoutId);
    }

    let isActive = true;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingRange(true);
      setRangeMessage("");
      const shouldUsePagedRead = !timeFrom && !timeTo;

      const readPromise = shouldUsePagedRead
        ? readCollectionsPage({
            salesPersonId:
              selectedSalesperson === "all" ? undefined : selectedSalesperson,
            area: selectedArea === "all" ? undefined : selectedArea,
            paymentMode:
              selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            limit: adminCollectionPageSize,
          })
        : readSupabaseCollectionsWithShops(createSupabaseBrowserClient(), {
            salesPersonId:
              selectedSalesperson === "all" ? undefined : selectedSalesperson,
            area: selectedArea === "all" ? undefined : selectedArea,
            paymentMode:
              selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            ascending: true,
          }).then((collectionsRead) => ({
            collections: collectionsRead.collections,
            shops: collectionsRead.shops,
            summary: null,
            nextCursor: null,
          }));

      readPromise
        .then((collectionsRead) => {
          if (!isActive) {
            return;
          }

          setLiveCollections(collectionsRead.collections);
          setLiveShops(collectionsRead.shops);
          setNextCollectionCursor(shouldUsePagedRead ? collectionsRead.nextCursor : null);
          if (collectionsRead.summary) {
            setServerCollectionSummary(collectionsRead.summary);
          }
          collectionDeltaSinceRef.current = getDeltaCheckpoint();
          setRangeMessage("");
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          setRangeMessage(
            error instanceof Error ? error.message : "Unable to load collections.",
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
    initialCollections,
    selectedArea,
    selectedPaymentMode,
    selectedSalesperson,
    timeFrom,
    timeTo,
  ]);

  const refreshChangedCollections = useCallback(async () => {
    if (
      !initialCollections ||
      isDeltaRefreshPendingRef.current ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    ) {
      return;
    }

    const range = getUtcRangeForIndiaDateRange(dateFrom, dateTo);

    if (!range.start && !range.end) {
      return;
    }

    const nextCheckpoint = getDeltaCheckpoint();
    let cursor: string | null = null;
    let changedCollections: LocalCollection[] = [];
    let changedShops: SalesRouteShop[] = [];
    isDeltaRefreshPendingRef.current = true;

    try {
      for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
        const collectionsRead = await readCollectionsPage({
          salesPersonId:
            selectedSalesperson === "all" ? undefined : selectedSalesperson,
          area: selectedArea === "all" ? undefined : selectedArea,
          paymentMode:
            selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
          createdAtFrom: range.start,
          createdAtTo: range.end,
          updatedAtFrom: collectionDeltaSinceRef.current,
          cursor,
          limit: adminCollectionPageSize,
          includeSummary: pageIndex === 0 && canUseServerCollectionSummary,
        });

        changedCollections = mergeCollectionPage(
          changedCollections,
          collectionsRead.collections,
        );
        changedShops = mergeUniqueShops(changedShops, collectionsRead.shops);
        cursor = collectionsRead.nextCursor;

        if (pageIndex === 0 && collectionsRead.summary) {
          setServerCollectionSummary(collectionsRead.summary);
        }

        if (!cursor) {
          break;
        }
      }

      if (changedCollections.length) {
        setLiveCollections((currentCollections) =>
          mergeCollectionPage(currentCollections || [], changedCollections),
        );
      }

      if (changedShops.length) {
        setLiveShops((currentShops) => mergeUniqueShops(currentShops, changedShops));
      }

      collectionDeltaSinceRef.current = nextCheckpoint;
      setRangeMessage("");
    } catch (error) {
      setRangeMessage(
        error instanceof Error ? error.message : "Unable to refresh collections.",
      );
    } finally {
      isDeltaRefreshPendingRef.current = false;
    }
  }, [
    canUseServerCollectionSummary,
    dateFrom,
    dateTo,
    initialCollections,
    selectedArea,
    selectedPaymentMode,
    selectedSalesperson,
  ]);

  useEffect(() => {
    if (!initialCollections) {
      return;
    }

    const handleRefresh = () => {
      void refreshChangedCollections();
    };

    window.addEventListener("manish:admin-collections-delta", handleRefresh);

    return () => {
      window.removeEventListener("manish:admin-collections-delta", handleRefresh);
    };
  }, [initialCollections, refreshChangedCollections]);

  function resetCollectionPage() {
    setNextCollectionCursor(null);
  }

  async function handleDelete(collection: LocalCollection) {
    if (!window.confirm("Permanently delete this collection? This cannot be undone.")) {
      return;
    }

    setDeletingCollectionId(collection.id);

    try {
      await deleteCoreCollectionPermanently(collection);
      setDeletedCollectionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(collection.id);
        return nextIds;
      });
      setSelectedCollection(null);
      setEditingCollection(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete this collection.";
      window.alert(`Collection could not be deleted: ${message}`);
    } finally {
      setDeletingCollectionId(null);
    }
  }

  function handleEdited() {
    setEditingCollection(null);
    setRefreshKey((value) => value + 1);
  }

  async function handleLoadMoreCollections() {
    const range = getUtcRangeForIndiaDateRange(dateFrom, dateTo);

    if ((!range.start && !range.end) || !nextCollectionCursor) {
      return;
    }

    setIsLoadingNextCollections(true);
    setRangeMessage("");

    try {
      const collectionsRead = await readCollectionsPage({
        salesPersonId:
          selectedSalesperson === "all" ? undefined : selectedSalesperson,
        area: selectedArea === "all" ? undefined : selectedArea,
        paymentMode:
          selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
        createdAtFrom: range.start,
        createdAtTo: range.end,
        cursor: nextCollectionCursor,
        limit: adminCollectionPageSize,
        includeSummary: false,
      });

      setLiveCollections((currentCollections) =>
        mergeCollectionPage(currentCollections || [], collectionsRead.collections),
      );
      setLiveShops((currentShops) => mergeUniqueShops(currentShops, collectionsRead.shops));
      setNextCollectionCursor(collectionsRead.nextCursor);
    } catch (error) {
      setRangeMessage(
        error instanceof Error ? error.message : "Unable to load more collections.",
      );
    } finally {
      setIsLoadingNextCollections(false);
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
    const dateLabel =
      dateFrom || dateTo
        ? `${dateFrom ? formatPdfDateOnly(dateFrom) : "Start"} to ${
            dateTo ? formatPdfDateOnly(dateTo) : "End"
          }`
        : "All dates";
    const fileDateLabel =
      dateFrom || dateTo
        ? `${dateFrom ? fileDate(dateFrom) : "start"}_to_${dateTo ? fileDate(dateTo) : "end"}`
        : "all-dates";
    const timeLabel =
      timeFrom || timeTo ? `${timeFrom || "Start"} to ${timeTo || "End"}` : "";
    const paymentLabel =
      selectedPaymentMode === "all"
        ? "All modes"
        : paymentModeLabels[selectedPaymentMode];
    let exportRows = visibleRows;
    let exportShops = shops;

    if (initialCollections && (dateFrom || dateTo)) {
      setIsLoadingRange(true);

      try {
        const range = getUtcRangeForIndiaDateRange(dateFrom, dateTo);
        const supabase = createSupabaseBrowserClient();
        const collectionsRead = await readSupabaseCollectionsWithShops(supabase, {
          salesPersonId:
            selectedSalesperson === "all" ? undefined : selectedSalesperson,
          area: selectedArea === "all" ? undefined : selectedArea,
          paymentMode:
            selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
          createdAtFrom: range.start,
          createdAtTo: range.end,
          ascending: true,
        });
        exportShops = mergeUniqueShops(shops, collectionsRead.shops);
        const exportShopById = new Map(exportShops.map((shop) => [shop.id, shop]));
        const fullRows = collectionsRead.collections.flatMap((collection) =>
          collection.bills.map((bill) => ({
            collection,
            bill,
            shop: exportShopById.get(collection.shopId),
            salespersonName: getSalespersonName(
              userNameById,
              collection.salesPersonId,
            ),
          })),
        );
        exportRows = filterAndSortRows(fullRows);
      } finally {
        setIsLoadingRange(false);
      }
    }

    const pdfRows: CollectionPdfRow[] = exportRows.map((row) => ({
      collectionId: row.collection.id,
      shopId: row.collection.shopId,
      salesPersonId: row.collection.salesPersonId,
      collectionType: row.collection.collectionType,
      notes: row.bill.notes || "",
      billDate: row.bill.billDate,
      billNumber: row.bill.billNumber,
      chequeDate: row.bill.chequeDate,
      amount: row.bill.amount,
      discount: row.bill.discount,
      replacement: row.bill.replacement,
      paymentMode: row.bill.paymentMode,
      createdAt: row.collection.createdAt,
    }));
    const { buildCollectionsPdf } = await import("@/lib/pdf/collections-report");
    const pdfBlob = buildCollectionsPdf({
      rows: pdfRows,
      shops: exportShops,
      users,
      titleParts: [
        salespersonLabel,
        areaLabel,
        paymentLabel,
        dateLabel,
        timeLabel,
      ].filter(Boolean),
    });

    downloadBlob(
      pdfBlob,
      `${salespersonFileLabel}-collections_${areaFileLabel}_${fileSafe(paymentLabel)}_${fileDateLabel}.pdf`,
    );
  }

  return (
    <section
      id="collections"
      className="min-w-0 space-y-4 scroll-mt-32"
      aria-labelledby="admin-collections-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-700">
              Central payment review
            </p>
            <h2
              id="admin-collections-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              Collections
            </h2>
            <p className="mt-2 max-w-2xl text-stone-600">
              Local route and adhoc collection review with bill rows, payment
              totals, PDF export, and admin edit controls.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[560px]">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">
                Cash
              </p>
              <p className="mt-1 text-xl font-bold text-stone-900">
                Rs. {modeTotals.cash.toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-orange-700">
                UPI
              </p>
              <p className="mt-1 text-xl font-bold text-orange-800">
                Rs. {modeTotals.upi.toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-sky-700">
                Cheque
              </p>
              <p className="mt-1 text-xl font-bold text-sky-800">
                Rs. {modeTotals.cheque.toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Total
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-800">
                Rs. {totalAmount.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-800">
              Salesperson
            </span>
            <select
              value={selectedSalesperson}
              onChange={(event) => {
                resetCollectionPage();
                setSelectedSalesperson(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
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
            <span className="text-sm font-semibold text-slate-800">Area</span>
            <select
              value={selectedArea}
              onChange={(event) => {
                resetCollectionPage();
                setSelectedArea(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
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
            <span className="text-sm font-semibold text-slate-800">
              Payment mode
            </span>
            <select
              value={selectedPaymentMode}
              onChange={(event) => {
                resetCollectionPage();
                setSelectedPaymentMode(
                  event.target.value as PaymentMode | "all",
                );
              }}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              {paymentFilterOptions.map((paymentMode) => (
                <option key={paymentMode} value={paymentMode}>
                  {paymentMode === "all"
                    ? "All"
                    : paymentModeLabels[paymentMode]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Date from
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                resetCollectionPage();
                setDateFrom(event.target.value);
              }}
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
              onChange={(event) => {
                resetCollectionPage();
                setDateTo(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">From</span>
            <input
              type="time"
              value={timeFrom}
              onChange={(event) => {
                resetCollectionPage();
                setTimeFrom(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">To</span>
            <input
              type="time"
              value={timeTo}
              onChange={(event) => {
                resetCollectionPage();
                setTimeTo(event.target.value);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <button
            type="button"
            disabled={!visibleRows.length}
            onClick={handleExportPdf}
            className="inline-flex w-full items-center justify-center gap-2 self-end rounded-md bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Export PDF
          </button>
        </div>
        {isLoadingRange || rangeMessage ? (
          <p className="mt-3 text-sm font-semibold text-stone-600">
            {isLoadingRange ? "Loading selected collection range..." : rangeMessage}
          </p>
        ) : null}
      </div>

      {visibleRows.length ? (
        <div className="max-w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {visibleRows.length} loaded collection row{visibleRows.length === 1 ? "" : "s"}.
            </span>
            {nextCollectionCursor ? (
              <button
                type="button"
                disabled={isLoadingRange || isLoadingNextCollections}
                onClick={() => void handleLoadMoreCollections()}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-orange-200 px-3 py-1.5 font-bold text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-wait disabled:text-stone-500"
              >
                {isLoadingNextCollections ? "Loading..." : "Load next 100"}
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-left text-sm">
              <thead className="bg-stone-100 text-stone-700">
                <tr>
                  <th className="min-w-16 px-3 py-2">No.</th>
                  <th className="min-w-32 px-3 py-2">Bill date</th>
                  <th className="min-w-60 px-3 py-2">Shop name</th>
                  <th className="min-w-48 px-3 py-2">Salesperson</th>
                  <th className="min-w-32 px-3 py-2 text-right">Amount</th>
                  <th className="min-w-32 px-3 py-2 text-right">Discount</th>
                  <th className="min-w-36 px-3 py-2 text-right">Replacement</th>
                  <th className="min-w-28 px-3 py-2">Mode</th>
                  <th className="min-w-64 px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr
                    key={`${row.collection.id}-${row.bill.id}`}
                    className="border-t border-stone-200 transition-colors hover:bg-stone-50"
                  >
                    <td className="px-3 py-2 text-right font-bold text-slate-900">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p className="font-bold text-slate-900">
                        {formatDateForDisplay(row.bill.billDate)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="max-w-72 whitespace-normal font-bold break-words text-slate-900">
                        {row.shop?.name || "Unknown shop"}
                      </p>
                      <p className="text-slate-600">
                        {row.shop?.area || getUnknownShopLabel(row.collection)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="max-w-56 whitespace-normal break-words text-slate-700">
                        {row.salespersonName}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      Rs. {row.bill.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      Rs. {row.bill.discount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      Rs. {row.bill.replacement.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {paymentModeLabels[row.bill.paymentMode]}
                      {row.bill.chequeDate ? (
                        <p className="text-xs text-slate-600">
                          Chq: {formatDateForDisplay(row.bill.chequeDate)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCollection(row.collection)}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 font-bold whitespace-nowrap text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          View
                        </button>
                        {canShowMutations ? (
                          <button
                            type="button"
                            disabled={!canOpenMutationUi || !row.shop}
                            onClick={() => setEditingCollection(row.collection)}
                            className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-2 py-1 font-bold whitespace-nowrap text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                          >
                            <Edit3 className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </button>
                        ) : null}
                        {canShowMutations ? (
                          <button
                            type="button"
                            disabled={
                              !canMutate ||
                              deletingCollectionId === row.collection.id
                            }
                            onClick={() => void handleDelete(row.collection)}
                            className="inline-flex items-center gap-2 rounded-md border border-red-200 px-2 py-1 font-bold whitespace-nowrap text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {deletingCollectionId === row.collection.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <FileText
            className="mx-auto h-8 w-8 text-stone-400"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-bold text-stone-900">
            No local collections
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            Seed or create local collections to review them here.
          </p>
        </div>
      )}

      {selectedCollection ? (
        <CollectionDetail
          collection={selectedCollection}
          shop={shopById.get(selectedCollection.shopId)}
          onClose={() => setSelectedCollection(null)}
        />
      ) : null}

      {editingCollection && shopById.get(editingCollection.shopId) ? (
        <LocalCollectionEntry
          shop={shopById.get(editingCollection.shopId)!}
          salesPersonId={editingCollection.salesPersonId}
          actorId={actorId}
          existingCollection={editingCollection}
          persistenceEnabled={canMutate}
          onClose={() => setEditingCollection(null)}
          onSaved={handleEdited}
        />
      ) : null}
    </section>
  );
}
