"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Edit3, FileText, Share2, Trash2 } from "lucide-react";
import { LocalCollectionEntry } from "./local-collection-entry";
import {
  formatDateForDisplay,
  getIndiaDate,
  getUtcRangeForIndiaDate,
} from "@/lib/dates/india";
import { downloadBlob, fileSafe, personFileSafe } from "@/lib/browser/download";
import { readCollectionsPage } from "@/lib/admin/paged-read-api";
import {
  paymentModeLabels,
  readLocalCollections,
} from "@/lib/local/collections";
import { createOffsetCursor } from "@/lib/repositories/read-pagination";
import type { CollectionPdfRow } from "@/lib/pdf/collections-report";
import { deleteCoreCollectionPermanently } from "@/lib/sync/core-mutations";
import { getUnsyncedCollections } from "@/lib/sync/core-outbox";
import {
  mergeUniqueShops,
  readSupabaseCollectionsWithShops,
} from "@/lib/repositories/supabase-read";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  LocalCollection,
  LocalCollectionBill,
  PaymentMode,
  SalesRouteShop,
  UserProfile,
} from "@/types/domain";

type SalesCollectionsProps = {
  allShops: SalesRouteShop[];
  salesPersonId: string;
  salesPersonName: string;
  refreshKey: number;
  initialCollections?: LocalCollection[];
  initialCollectionRawRowCount?: number;
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
  routeWorkAllowed?: boolean;
  routeWorkMessage?: string;
};

type CollectionRow = {
  collection: LocalCollection;
  bill: LocalCollectionBill;
  shop: SalesRouteShop | undefined;
};

type CollectionTarget = {
  collectionType: "route" | "adhoc";
  shop: SalesRouteShop;
};

const paymentFilterOptions: Array<PaymentMode | "all"> = [
  "all",
  "cash",
  "cheque",
  "upi",
];

function getModeTotals(rows: CollectionRow[]) {
  return rows.reduce(
    (totals, row) => ({
      ...totals,
      [row.bill.paymentMode]: totals[row.bill.paymentMode] + row.bill.amount,
    }),
    { cash: 0, cheque: 0, upi: 0 },
  );
}

function formatAmount(value: number) {
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mergeCollectionsForDisplay(
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

const salesCollectionPageSize = 100;
const deltaOverlapMs = 5_000;

function getDeltaCheckpoint() {
  return new Date(Date.now() - deltaOverlapMs).toISOString();
}

export function SalesCollections({
  allShops,
  salesPersonId,
  salesPersonName,
  refreshKey,
  initialCollections,
  initialCollectionRawRowCount,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
  routeWorkAllowed = true,
  routeWorkMessage = "",
}: SalesCollectionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collectionTarget, setCollectionTarget] =
    useState<CollectionTarget | null>(null);
  const [editingCollection, setEditingCollection] =
    useState<LocalCollection | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedDate, setSelectedDate] = useState(getIndiaDate());
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<
    PaymentMode | "all"
  >("all");
  const [shareMessage, setShareMessage] = useState("");
  const [mutationMessage, setMutationMessage] = useState("");
  const [deletedCollectionIds, setDeletedCollectionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(
    null,
  );
  const [liveCollections, setLiveCollections] = useState<LocalCollection[] | null>(
    () => initialCollections?.slice(0, salesCollectionPageSize) || null,
  );
  const [liveShops, setLiveShops] = useState<SalesRouteShop[]>([]);
  const [nextCollectionCursor, setNextCollectionCursor] = useState<string | null>(
    () =>
      (initialCollectionRawRowCount || initialCollections?.length || 0) > salesCollectionPageSize
        ? createOffsetCursor(salesCollectionPageSize)
        : null,
  );
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const [isLoadingNextCollections, setIsLoadingNextCollections] = useState(false);
  const [dateMessage, setDateMessage] = useState("");
  const didSkipInitialDateReadRef = useRef(false);
  const collectionDeltaSinceRef = useRef(getDeltaCheckpoint());
  const isDeltaRefreshPendingRef = useRef(false);
  const displayShops = useMemo(
    () => mergeUniqueShops(allShops, liveShops),
    [allShops, liveShops],
  );
  const shopById = useMemo(
    () => new Map(displayShops.map((shop) => [shop.id, shop])),
    [displayShops],
  );
  const queryCollectionTarget = useMemo<CollectionTarget | null>(() => {
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return null;
    }

    const shop = shopById.get(shopId);
    if (!shop) {
      return null;
    }

    return {
      collectionType:
        searchParams.get("type") === "adhoc" ? "adhoc" : "route",
      shop,
    };
  }, [searchParams, shopById]);

  const activeCollectionTarget = mutationUiEnabled
    ? collectionTarget || queryCollectionTarget
    : null;
  const isRouteCollectionBlocked =
    activeCollectionTarget?.collectionType === "route" && !routeWorkAllowed;

  const collections = useMemo(
    () =>
      mergeCollectionsForDisplay(
        liveCollections ?? initialCollections,
        liveCollections || initialCollections
          ? []
          : readLocalCollections(refreshKey + localRefreshKey),
      )
        .filter((collection) => collection.salesPersonId === salesPersonId)
        .filter((collection) => !deletedCollectionIds.has(collection.id))
        .filter((collection) => collection.status !== "cancelled")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [
      deletedCollectionIds,
      initialCollections,
      liveCollections,
      localRefreshKey,
      refreshKey,
      salesPersonId,
    ],
  );
  const rows = useMemo(
    () =>
      collections.flatMap((collection) =>
        collection.bills.map((bill) => ({
          collection,
          bill,
          shop: shopById.get(collection.shopId),
        })),
      ),
    [collections, shopById],
  );
  const areaOptions = useMemo(
    () =>
      Array.from(new Set(displayShops.map((shop) => shop.area))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [displayShops],
  );
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const collectionDate = getIndiaDate(new Date(row.collection.createdAt));
        const areaMatches =
          selectedArea === "all" || row.shop?.area === selectedArea;
        const paymentMatches =
          selectedPaymentMode === "all" ||
          row.bill.paymentMode === selectedPaymentMode;

        return (
          areaMatches &&
          paymentMatches &&
          (!selectedDate || collectionDate === selectedDate)
        );
      }),
    [rows, selectedArea, selectedDate, selectedPaymentMode],
  );
  const modeTotals = getModeTotals(visibleRows);
  const pdfUsers = useMemo<UserProfile[]>(
    () => [
      {
        id: salesPersonId,
        fullName: salesPersonName,
        role: "sales",
        loginId: "",
        active: true,
        geofenceMeters: null,
      },
    ],
    [salesPersonId, salesPersonName],
  );

  function handleSaved() {
    setCollectionTarget(null);
    setEditingCollection(null);
    router.replace("/sales", { scroll: false });
    setLocalRefreshKey((value) => value + 1);
  }

  useEffect(() => {
    if (!initialCollections) {
      return;
    }

    if (!didSkipInitialDateReadRef.current) {
      didSkipInitialDateReadRef.current = true;
      return;
    }

    if (!selectedDate) {
      const timeoutId = window.setTimeout(() => {
        setLiveCollections([]);
        setLiveShops([]);
        setNextCollectionCursor(null);
        setDateMessage("Select a date to load collections.");
      });

      return () => window.clearTimeout(timeoutId);
    }

    const range = getUtcRangeForIndiaDate(selectedDate);
    let isActive = true;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingDate(true);
      setDateMessage("");
      readCollectionsPage({
        salesPersonId,
        area: selectedArea === "all" ? undefined : selectedArea,
        paymentMode:
          selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
        createdAtFrom: range.start,
        createdAtTo: range.end,
        limit: salesCollectionPageSize,
        includeSummary: false,
      })
        .then((collectionsRead) => {
          if (!isActive) {
            return;
          }

          setLiveCollections(collectionsRead.collections);
          setLiveShops(collectionsRead.shops);
          setNextCollectionCursor(collectionsRead.nextCursor);
          collectionDeltaSinceRef.current = getDeltaCheckpoint();
          setDateMessage("");
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }

          setDateMessage(
            error instanceof Error ? error.message : "Unable to load collections.",
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
    initialCollections,
    salesPersonId,
    selectedArea,
    selectedDate,
    selectedPaymentMode,
  ]);

  const refreshChangedCollections = useCallback(async () => {
    if (
      !initialCollections ||
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
    let changedCollections: LocalCollection[] = [];
    let changedShops: SalesRouteShop[] = [];
    isDeltaRefreshPendingRef.current = true;

    try {
      for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
        const collectionsRead = await readCollectionsPage({
          salesPersonId,
          area: selectedArea === "all" ? undefined : selectedArea,
          paymentMode:
            selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
          createdAtFrom: range.start,
          createdAtTo: range.end,
          updatedAtFrom: collectionDeltaSinceRef.current,
          cursor,
          limit: salesCollectionPageSize,
          includeSummary: false,
        });

        changedCollections = mergeCollectionPage(
          changedCollections,
          collectionsRead.collections,
        );
        changedShops = mergeUniqueShops(changedShops, collectionsRead.shops);
        cursor = collectionsRead.nextCursor;

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
    } catch {
      // Delta refresh is opportunistic; the next realtime event, focus, or manual navigation retries it.
    } finally {
      isDeltaRefreshPendingRef.current = false;
    }
  }, [initialCollections, salesPersonId, selectedArea, selectedDate, selectedPaymentMode]);

  useEffect(() => {
    if (!initialCollections) {
      return;
    }

    const handleRefresh = () => {
      void refreshChangedCollections();
    };

    window.addEventListener("manish:sales-collections-delta", handleRefresh);

    return () => {
      window.removeEventListener("manish:sales-collections-delta", handleRefresh);
    };
  }, [initialCollections, refreshChangedCollections]);

  function handleCloseCollectionEntry() {
    setCollectionTarget(null);
    if (queryCollectionTarget) {
      router.replace("/sales/collections", { scroll: false });
    }
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
      setMutationMessage("Collection deleted.");
      setEditingCollection(null);
      setLocalRefreshKey((value) => value + 1);
    } catch (error) {
      setMutationMessage(
        error instanceof Error ? error.message : "Unable to delete this collection.",
      );
    } finally {
      setDeletingCollectionId(null);
    }
  }

  async function handleLoadMoreCollections() {
    if (!selectedDate || !nextCollectionCursor) {
      return;
    }

    const range = getUtcRangeForIndiaDate(selectedDate);
    setIsLoadingNextCollections(true);
    setDateMessage("");

    try {
      const collectionsRead = await readCollectionsPage({
        salesPersonId,
        area: selectedArea === "all" ? undefined : selectedArea,
        paymentMode:
          selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
        createdAtFrom: range.start,
        createdAtTo: range.end,
        cursor: nextCollectionCursor,
        limit: salesCollectionPageSize,
        includeSummary: false,
      });

      setLiveCollections((currentCollections) =>
        mergeCollectionPage(currentCollections || [], collectionsRead.collections),
      );
      setLiveShops((currentShops) => mergeUniqueShops(currentShops, collectionsRead.shops));
      setNextCollectionCursor(collectionsRead.nextCursor);
    } catch (error) {
      setDateMessage(
        error instanceof Error ? error.message : "Unable to load more collections.",
      );
    } finally {
      setIsLoadingNextCollections(false);
    }
  }

  async function handleSharePdf() {
    const areaLabel = selectedArea === "all" ? "All areas" : selectedArea;
    const areaFileLabel = selectedArea === "all" ? "all-area" : fileSafe(areaLabel);
    const paymentLabel =
      selectedPaymentMode === "all"
        ? "All modes"
        : paymentModeLabels[selectedPaymentMode];
    let exportRows = visibleRows;
    let exportShops = displayShops;

    if (initialCollections && selectedDate) {
      setIsLoadingDate(true);

      try {
        const range = getUtcRangeForIndiaDate(selectedDate);
        const collectionsRead = await readSupabaseCollectionsWithShops(
          createSupabaseBrowserClient(),
          {
            salesPersonId,
            area: selectedArea === "all" ? undefined : selectedArea,
            paymentMode:
              selectedPaymentMode === "all" ? undefined : selectedPaymentMode,
            createdAtFrom: range.start,
            createdAtTo: range.end,
            ascending: true,
          },
        );
        exportShops = mergeUniqueShops(displayShops, collectionsRead.shops);
        const exportShopById = new Map(exportShops.map((shop) => [shop.id, shop]));
        exportRows = collectionsRead.collections.flatMap((collection) =>
          collection.bills.map((bill) => ({
            collection,
            bill,
            shop: exportShopById.get(collection.shopId),
          })),
        );
      } finally {
        setIsLoadingDate(false);
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
      users: pdfUsers,
      titleParts: [
        salesPersonName,
        areaLabel,
        paymentLabel,
        formatDateForDisplay(selectedDate),
      ],
    });
    const filename = `${personFileSafe(salesPersonName)}-collections_${areaFileLabel}_${fileSafe(
      paymentLabel,
    )}_${fileSafe(formatDateForDisplay(selectedDate))}.pdf`;
    const file = new File([pdfBlob], filename, { type: "application/pdf" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: "Manish Masala Collections",
          text: "Collection details",
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
      id="collections"
      className="scroll-mt-32 space-y-4"
      aria-labelledby="collections-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="collections-title"
              className="text-2xl font-bold text-stone-900"
            >
              My Collections
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Review collections and payment-mode totals for the selected
              filters.
            </p>
          </div>
          <button
            type="button"
            disabled={!visibleRows.length}
            onClick={handleSharePdf}
            className="hidden cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300 sm:inline-flex"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            Share PDF
          </button>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
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
              max={getIndiaDate()}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-stone-700">
              Payment mode
            </span>
            <select
              value={selectedPaymentMode}
              onChange={(event) =>
                setSelectedPaymentMode(
                  event.target.value as PaymentMode | "all",
                )
              }
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
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
          <button
            type="button"
            disabled={!visibleRows.length}
            onClick={handleSharePdf}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300 sm:hidden"
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
            {isLoadingDate ? "Loading selected collection date..." : dateMessage}
          </p>
        ) : null}
        {mutationMessage ? (
          <p className="mt-3 text-sm text-orange-800" role="status">
            {mutationMessage}
          </p>
        ) : null}
      </div>

      {!writesEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Live write protection is active.</p>
          <p className="mt-1">
            {mutationUiEnabled
              ? "Collection forms are available for preview, but final Save buttons are disabled."
              : "Collections are visible from Supabase, but collection actions are disabled."}
          </p>
        </div>
      ) : null}
      {isRouteCollectionBlocked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Route collection is paused.</p>
          <p className="mt-1">{routeWorkMessage}</p>
        </div>
      ) : null}

      {visibleRows.length ? (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {visibleRows.length} loaded collection row{visibleRows.length === 1 ? "" : "s"}.
            </span>
            {nextCollectionCursor ? (
              <button
                type="button"
                disabled={isLoadingDate || isLoadingNextCollections}
                onClick={() => void handleLoadMoreCollections()}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-orange-200 px-3 py-1.5 font-bold text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-wait disabled:text-stone-500"
              >
                {isLoadingNextCollections ? "Loading..." : "Load next 100"}
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-230 w-full text-left text-sm">
              <thead className="bg-stone-100 text-stone-700">
                <tr>
                  <th className="w-14 px-3 py-3 font-bold">No.</th>
                  <th className="w-28 px-3 py-3 font-bold">Bill date</th>
                  <th className="min-w-56 px-3 py-3 font-bold">Shop name</th>
                  <th className="min-w-40 px-3 py-3 font-bold">Salesperson</th>
                  <th className="w-28 px-3 py-3 text-right font-bold">Amount</th>
                  <th className="w-28 px-3 py-3 text-right font-bold">Discount</th>
                  <th className="w-32 px-3 py-3 text-right font-bold">Replacement</th>
                  <th className="w-24 px-3 py-3 font-bold">Mode</th>
                  <th className="w-40 px-3 py-3 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr
                    key={`${row.collection.id}-${row.bill.id}`}
                    className="border-t border-stone-200 transition-colors hover:bg-stone-50"
                  >
                    <td className="px-3 py-3 text-center font-bold text-stone-700">
                      {index + 1}
                    </td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap text-stone-700">
                      {formatDateForDisplay(row.bill.billDate)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-stone-900">
                        {row.shop?.name || "Unknown shop"}
                      </p>
                      <p className="mt-1 text-xs text-stone-600">
                        {row.shop?.area || "Unknown area"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {salesPersonName}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-stone-900">
                      {formatAmount(row.bill.amount)}
                    </td>
                    <td className="px-3 py-3 text-right text-stone-700">
                      {row.bill.discount ? formatAmount(row.bill.discount) : "-"}
                    </td>
                    <td className="px-3 py-3 text-right text-stone-700">
                      {row.bill.replacement
                        ? formatAmount(row.bill.replacement)
                        : "-"}
                    </td>
                    <td className="px-3 py-3 font-semibold text-stone-800">
                      {paymentModeLabels[row.bill.paymentMode]}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={!mutationUiEnabled || !row.shop}
                          onClick={() => setEditingCollection(row.collection)}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 font-bold text-orange-800 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-white disabled:text-stone-400"
                        >
                          <Edit3 className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={
                            !writesEnabled ||
                            deletingCollectionId === row.collection.id
                          }
                          onClick={() => void handleDelete(row.collection)}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-white disabled:text-stone-400"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {deletingCollectionId === row.collection.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
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
            No collections found
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            Try changing the area, date, or payment-mode filter.
          </p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Cash</p>
          <p className="mt-1 text-xl font-bold text-stone-900">
            {formatAmount(modeTotals.cash)}
          </p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-semibold text-sky-900">Cheque</p>
          <p className="mt-1 text-xl font-bold text-stone-900">
            {formatAmount(modeTotals.cheque)}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">UPI</p>
          <p className="mt-1 text-xl font-bold text-stone-900">
            {formatAmount(modeTotals.upi)}
          </p>
        </div>
      </div>

      {activeCollectionTarget && !isRouteCollectionBlocked ? (
        <LocalCollectionEntry
          shop={activeCollectionTarget.shop}
          salesPersonId={salesPersonId}
          collectionType={activeCollectionTarget.collectionType}
          persistenceEnabled={writesEnabled}
          onClose={handleCloseCollectionEntry}
          onSaved={handleSaved}
        />
      ) : null}

      {mutationUiEnabled &&
      editingCollection &&
      shopById.get(editingCollection.shopId) ? (
        <LocalCollectionEntry
          shop={shopById.get(editingCollection.shopId)!}
          salesPersonId={salesPersonId}
          existingCollection={editingCollection}
          persistenceEnabled={writesEnabled}
          onClose={() => setEditingCollection(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}
