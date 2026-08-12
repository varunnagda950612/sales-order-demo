"use client";

import { X } from "lucide-react";
import { getKgLabel, getTotalKgLabel } from "@/lib/orders/weights";
import type { LocalOrder } from "@/types/domain";

type OrderDetailPanelProps = {
  order: LocalOrder;
  shopName: string;
  subtitle?: string;
  onClose: () => void;
};

function formatMoney(value: number, options: { maximumFractionDigits?: number } = {}) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
}

export function OrderDetailPanel({
  order,
  shopName,
  subtitle,
  onClose,
}: OrderDetailPanelProps) {
  const totalKgLabel = getTotalKgLabel(order.items);

  return (
    <div className="fixed inset-0 z-50 flex h-dvh items-start justify-center overflow-hidden bg-stone-950/50 p-3 sm:p-4">
      <section className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg bg-white p-3 shadow-xl sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-stone-900">Order Details</h2>
            <p className="mt-1 text-base font-medium break-words text-stone-600">
              {shopName}
            </p>
            {subtitle ? (
              <p className="mt-1 text-xs font-semibold text-orange-700">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-3 text-base font-bold text-stone-600 shadow-sm hover:bg-stone-50"
            aria-label="Close order detail"
          >
            Close
            <X className="sr-only h-0 w-0" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="mb-3 text-sm font-bold text-emerald-700">
            Total KG - {totalKgLabel}
          </p>

          <div className="space-y-2">
            {order.items.map((item) => {
              const kgLabel = getKgLabel(item.skuSize, item.quantity);

              return (
                <article
                  key={item.skuId}
                  className="rounded-lg border border-stone-200 bg-white p-3"
                >
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold leading-5 break-words text-stone-800">
                        {item.productName}
                        {kgLabel ? (
                          <>
                            {" - "}
                            <span className="text-emerald-700">{kgLabel}</span>
                          </>
                        ) : null}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-stone-600">
                        Rs. {formatMoney(item.rate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold whitespace-nowrap text-stone-600">
                        {item.skuSize} x {item.quantity} pcs
                      </p>
                      <p className="mt-2 text-base font-bold whitespace-nowrap text-stone-900">
                        Rs. {formatMoney(item.lineTotal)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-bold text-stone-600">
                Subtotal
              </span>
              <strong className="text-lg text-stone-950">
                Rs. {formatMoney(order.subtotal)}
              </strong>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-base font-bold text-stone-600">
                GST @5%
              </span>
              <strong className="text-lg text-stone-950">
                Rs. {formatMoney(order.gstAmount)}
              </strong>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-orange-200 pt-3">
              <span className="text-base font-bold text-stone-600">Total</span>
              <strong className="text-lg text-stone-950">
                Rs.{" "}
                {formatMoney(order.grandTotal, { maximumFractionDigits: 0 })}
              </strong>
            </div>
          </div>

          <div className="mt-3 space-y-3 pb-1">
            <div>
              <p className="text-sm font-bold text-stone-600">Free</p>
              <div className="mt-2 min-h-20 rounded-lg border border-stone-200 bg-white p-3 text-sm whitespace-pre-wrap text-stone-700">
                {order.notes}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-stone-600">Replacement</p>
              <div className="mt-2 min-h-20 rounded-lg border border-stone-200 bg-white p-3 text-sm whitespace-pre-wrap text-stone-700">
                {order.replacementNotes}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
