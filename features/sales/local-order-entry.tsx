"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Package, Search, ShoppingCart } from "lucide-react";
import { buildLocalOrder, buildLocalOrderItems } from "@/lib/local/orders";
import { readLocalProductSkus } from "@/lib/local/products";
import { getKgLabel, getTotalKgLabel } from "@/lib/orders/weights";
import { sortProductSkusForDisplay } from "@/lib/products/display-order";
import { commitCoreOrder } from "@/lib/sync/core-mutations";
import {
  formatTargetKg,
  getItemsKgForTarget,
  roundTargetKg,
  type TargetProgress,
} from "@/lib/targets/progress";
import type { LocalOrder, LocalProductSku, SalesRouteShop } from "@/types/domain";

type LocalOrderEntryProps = {
  shop: SalesRouteShop;
  salesPersonId: string;
  productSkus?: LocalProductSku[];
  activeTargetProgress?: TargetProgress[];
  actorId?: string;
  orderType?: "route" | "adhoc";
  visitPosition?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
    saveShopAnchor?: boolean;
    distanceMeters?: number | null;
  } | null;
  existingOrder?: LocalOrder;
  canSaveExistingOrder?: () => boolean;
  persistenceEnabled?: boolean;
  onClose: () => void;
  onSaved: (order: LocalOrder) => void;
};

type Step = "entry" | "review";

function matchesProductSearch(productSku: LocalProductSku, searchValue: string) {
  const value = searchValue.trim().toLowerCase();

  if (!value) {
    return true;
  }

  return [productSku.productName, productSku.skuSize, productSku.skuCode]
    .filter(Boolean)
    .some((item) => item?.toLowerCase().includes(value));
}

function getInitialQuantities(existingOrder?: LocalOrder) {
  return Object.fromEntries(existingOrder?.items.map((item) => [item.skuId, item.quantity]) || []);
}

function formatMoney(value: number) {
  if (!value) {
    return "-";
  }

  return `Rs. ${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function ProductSkuImage({ sku }: { sku: LocalProductSku }) {
  if (!sku.photoUrl) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50">
        <Package className="h-5 w-5 text-orange-300" aria-hidden="true" />
      </div>
    );
  }

  return (
    // Product image URLs are user-managed and may use different storage hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sku.photoUrl}
      alt={sku.productName}
      loading="lazy"
      decoding="async"
      className="h-12 w-12 shrink-0 rounded-lg border border-orange-200 bg-white object-contain"
    />
  );
}

function getPrimaryTargetBySkuId(targetProgress: TargetProgress[]) {
  const targetBySkuId = new Map<string, TargetProgress>();

  targetProgress.forEach((item) => {
    if (!item.target.productSkuId) {
      return;
    }

    const existingItem = targetBySkuId.get(item.target.productSkuId);

    if (
      !existingItem ||
      item.target.endDate < existingItem.target.endDate ||
      (item.target.endDate === existingItem.target.endDate &&
        item.pendingKg < existingItem.pendingKg)
    ) {
      targetBySkuId.set(item.target.productSkuId, item);
    }
  });

  return targetBySkuId;
}

function ProductTargetBadge({
  item,
  quantity,
  existingOrder,
}: {
  item: TargetProgress;
  quantity: number;
  existingOrder?: LocalOrder;
}) {
  const existingOrderKg = existingOrder
    ? getItemsKgForTarget(item.target, existingOrder.items)
    : 0;
  const selectedKg = roundTargetKg((quantity * item.target.grams) / 1000);
  const projectedCompletedKg = Math.max(
    roundTargetKg(item.completedKg - existingOrderKg + selectedKg),
    0,
  );
  const projectedPendingKg = Math.max(
    roundTargetKg(item.target.targetKg - projectedCompletedKg),
    0,
  );

  if (quantity > 0) {
    return (
      <span className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
        <span>Target</span>
        <span>+{formatTargetKg(selectedKg)}</span>
        <span>
          {projectedPendingKg > 0
            ? `${formatTargetKg(projectedPendingKg)} left`
            : "completed"}
        </span>
      </span>
    );
  }

  return (
    <span className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-800">
      <span>Target SKU</span>
      <span>
        {item.pendingKg > 0 ? `${formatTargetKg(item.pendingKg)} left` : "completed"}
      </span>
    </span>
  );
}

export function LocalOrderEntry({
  shop,
  salesPersonId,
  productSkus: initialProductSkus,
  activeTargetProgress = [],
  actorId,
  orderType = "route",
  visitPosition,
  existingOrder,
  canSaveExistingOrder = () => true,
  persistenceEnabled = true,
  onClose,
  onSaved,
}: LocalOrderEntryProps) {
  const [productSkus] = useState(() => initialProductSkus || readLocalProductSkus());
  const [searchValue, setSearchValue] = useState("");
  const [quantitiesBySkuId, setQuantitiesBySkuId] = useState<Record<string, number>>(() =>
    getInitialQuantities(existingOrder),
  );
  const [notes, setNotes] = useState(existingOrder?.notes || "");
  const [replacementNotes, setReplacementNotes] = useState(existingOrder?.replacementNotes || "");
  const [step, setStep] = useState<Step>("entry");
  const [message, setMessage] = useState<string | null>(null);
  const activeTargetBySkuId = useMemo(
    () => getPrimaryTargetBySkuId(activeTargetProgress),
    [activeTargetProgress],
  );

  const visibleProductSkus = useMemo(
    () =>
      sortProductSkusForDisplay(
        productSkus.filter((productSku) => matchesProductSearch(productSku, searchValue)),
      ).slice(0, 80),
    [productSkus, searchValue],
  );

  const selectedItems = useMemo(
    () => buildLocalOrderItems(productSkus, quantitiesBySkuId),
    [productSkus, quantitiesBySkuId],
  );

  const subtotal = selectedItems.reduce((total, item) => total + item.lineTotal, 0);
  const gstAmount = Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = Math.round((subtotal + gstAmount) * 100) / 100;
  const totalKgLabel = getTotalKgLabel(selectedItems);

  function updateQuantity(skuId: string, value: string) {
    const quantity = Number(value);
    setQuantitiesBySkuId((currentValue) => ({
      ...currentValue,
      [skuId]: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
    }));
  }

  function handleReview() {
    if (!selectedItems.length) {
      setMessage("Enter quantity for at least one SKU.");
      return;
    }

    setMessage(null);
    setStep("review");
  }

  function handleSave() {
    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Saving is disabled to protect live data.");
      setStep("entry");
      return;
    }

    if (existingOrder && !canSaveExistingOrder()) {
      setMessage(
        "This order can no longer be edited. Sales orders are editable until 11:59 pm on the day they are created.",
      );
      setStep("entry");
      return;
    }

    if (!window.confirm(existingOrder ? "Update this order?" : "Save this order?")) {
      return;
    }

    const order = buildLocalOrder({
      existingOrder,
      shopId: shop.id,
      salesPersonId,
      orderType,
      visitPosition,
      items: selectedItems,
      notes,
      replacementNotes,
    });

    try {
      const isRouteVisitSave = orderType === "route" && Boolean(visitPosition);
      const commitResult = commitCoreOrder(order, {
        createRouteVisitProof: isRouteVisitSave,
        actorId: actorId || salesPersonId,
        saveShopAnchor: Boolean(visitPosition?.saveShopAnchor),
        distanceMeters: visitPosition?.distanceMeters ?? null,
      });

      if (commitResult.recoveryWarning) {
        window.alert(commitResult.recoveryWarning);
      }

      onSaved(order);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to protect this order for sync.");
      setStep("entry");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/50 p-3 sm:items-center sm:p-4">
      <section className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white p-3 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 pb-2">
          <div>
            <h2 className="text-xl font-bold text-stone-900">
              {existingOrder ? "Edit Order" : "Create Order"}
            </h2>
            <p className="mt-1 text-sm font-medium text-stone-600">{shop.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-3 font-bold text-stone-600 shadow-sm transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
            aria-label="Close order entry"
          >
            Close
          </button>
        </div>

        <div className="mt-2 min-h-0 flex-1 pr-1">
        {productSkus.length ? null : (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
            Seed local product data before creating orders.
          </div>
        )}
        {!persistenceEnabled ? (
          <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-900">
            Preview mode is active. You can test this form, but saving is disabled to protect live data.
          </p>
        ) : null}

        {step === "entry" ? (
          <div className="flex h-[calc(100dvh-8.75rem)] min-h-0 flex-col gap-3 sm:h-[min(720px,calc(100dvh-9.5rem))]">
            <label className="block shrink-0">
              <span className="text-sm font-semibold text-stone-700">Search product</span>
              <span className="mt-2 flex rounded-lg border border-orange-200 bg-white transition-colors focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-100">
                <Search className="ml-3 mt-3 h-4 w-4 text-stone-400" aria-hidden="true" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-base text-stone-900 focus:outline-none"
                  placeholder="Search Haldi, Mirchi, HP, 50gm..."
                />
              </span>
            </label>

            <div className="min-h-0 flex-[2] space-y-2 overflow-y-auto pr-1">
              {visibleProductSkus.map((productSku) => {
                const quantity = quantitiesBySkuId[productSku.id] || 0;
                const kgLabel = quantity ? getKgLabel(productSku.skuSize, quantity) : "";
                const targetProgress = activeTargetBySkuId.get(productSku.id);

                return (
                  <article
                    key={productSku.id}
                    className={`rounded-lg border p-2.5 transition-colors ${
                      quantity
                        ? "border-orange-300 bg-orange-50/30"
                        : "border-orange-200 bg-white hover:bg-orange-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ProductSkuImage sku={productSku} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-stone-900">
                          {productSku.productName}
                        </h3>
                        <p className="mt-0.5 text-sm text-stone-600">
                          MRP: Rs. {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(productSku.mrp)}
                        </p>
                        <p className="mt-2 text-sm font-bold text-stone-900">
                          <span className="text-stone-600">Rate</span> Rs. {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(productSku.rate)}
                        </p>
                        {targetProgress ? (
                          <ProductTargetBadge
                            item={targetProgress}
                            quantity={quantity}
                            existingOrder={existingOrder}
                          />
                        ) : null}
                      </div>
                      <div className="w-24 shrink-0">
                        <p className="mb-2 text-sm font-bold text-stone-600">
                          Qty - {kgLabel ? <span className="text-emerald-700">{kgLabel}</span> : null}
                        </p>
                        <label className="flex h-10 items-center rounded-lg border border-orange-200 bg-white focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-100">
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            placeholder="0"
                            value={quantity || ""}
                            onChange={(event) => updateQuantity(productSku.id, event.target.value)}
                            className="min-w-0 flex-1 rounded-l-lg border-0 bg-transparent px-2 text-base text-stone-900 focus:outline-none"
                            aria-label={`Quantity for ${productSku.productName} ${productSku.skuSize}`}
                          />
                          <span className="pr-2 text-xs font-bold text-stone-600">pcs</span>
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-orange-100 pt-2 pr-1">
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-bold text-stone-600">Subtotal</span>
                  <strong className="text-right text-stone-900">{formatMoney(subtotal)}</strong>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="font-bold text-stone-600">GST @5%</span>
                  <strong className="text-right text-stone-900">{formatMoney(gstAmount)}</strong>
                </div>
                <div className="mt-2 flex justify-between gap-3 border-t border-orange-200 pt-2">
                  <span className="font-bold text-stone-600">Total</span>
                  <strong className="text-right text-stone-900">{formatMoney(grandTotal)}</strong>
                </div>
                <div className="mt-2 flex justify-between gap-3 border-t border-orange-200 pt-2">
                  <span className="font-bold text-emerald-700">Total KG</span>
                  <strong className="text-right text-emerald-700">{totalKgLabel}</strong>
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Free</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-1 min-h-16 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Replacement</span>
                <textarea
                  value={replacementNotes}
                  onChange={(event) => setReplacementNotes(event.target.value)}
                  className="mt-1 min-h-16 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </label>

              {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">{message}</p> : null}

              <button
                type="button"
                onClick={handleReview}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-orange-700"
              >
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                Review Order
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-[calc(100dvh-8.75rem)] min-h-0 flex-col gap-3 sm:h-[min(720px,calc(100dvh-9.5rem))]">
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setStep("entry")}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-stone-200">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-stone-100 text-stone-700">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item) => (
                    <tr key={item.skuId} className="border-t border-stone-200">
                      <td className="px-3 py-2">
                        <p className="font-bold text-stone-900">{item.productName}</p>
                        <p className="text-stone-600">{item.skuSize}</p>
                      </td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">Rs. {item.rate}</td>
                      <td className="px-3 py-2 text-right font-bold">Rs. {item.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 overflow-y-auto">
              <div className="ml-auto w-full max-w-sm rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-stone-700">
              <div className="flex justify-between font-bold text-emerald-700">
                <span>Total KG</span>
                <strong>{totalKgLabel}</strong>
              </div>
              <div className="mt-2 flex justify-between border-t border-orange-200 pt-2">
                <span>Subtotal</span>
                <strong>Rs. {subtotal.toFixed(2)}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span>GST 5%</span>
                <strong>Rs. {gstAmount.toFixed(2)}</strong>
              </div>
              <div className="mt-2 flex justify-between border-t border-orange-200 pt-2 text-base">
                <span>Grand Total</span>
                <strong>Rs. {grandTotal.toFixed(2)}</strong>
              </div>
              </div>

              <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={!persistenceEnabled}
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                {existingOrder ? "Update Order" : "Place Order"}
              </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
