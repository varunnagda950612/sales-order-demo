"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Plus, QrCode, Trash2, X } from "lucide-react";
import {
  buildLocalCollection,
  paymentModeLabels,
} from "@/lib/local/collections";
import { getIndiaDate } from "@/lib/dates/india";
import { commitCoreCollection } from "@/lib/sync/core-mutations";
import type { LocalCollection, LocalCollectionBill, PaymentMode, SalesRouteShop } from "@/types/domain";

type LocalCollectionEntryProps = {
  shop: SalesRouteShop;
  salesPersonId: string;
  actorId?: string;
  collectionType?: "route" | "adhoc";
  existingCollection?: LocalCollection;
  persistenceEnabled?: boolean;
  onClose: () => void;
  onSaved: (collection: LocalCollection) => void;
};

type EditableBill = Omit<LocalCollectionBill, "amount" | "discount" | "replacement"> & {
  amount: string;
  discount: string;
  replacement: string;
};

const paymentModes: PaymentMode[] = ["cash", "cheque", "upi"];
const upiQrImagePath = "/icons/upi-qr.jpeg";
type CollectionEntryStep = "entry" | "preview";

function getTodayValue() {
  return getIndiaDate();
}

function createEmptyBill(paymentMode: PaymentMode = "cash", chequeDate: string | null = null): EditableBill {
  return {
    id: crypto.randomUUID(),
    billDate: getTodayValue(),
    billNumber: "",
    amount: "",
    discount: "",
    replacement: "",
    notes: "",
    paymentMode,
    chequeDate: paymentMode === "cheque" ? chequeDate : null,
  };
}

function getInitialBills(existingCollection?: LocalCollection) {
  if (!existingCollection?.bills.length) {
    return [createEmptyBill()];
  }

  return existingCollection.bills.map((bill) => ({
    ...bill,
    notes: bill.notes || "",
    amount: String(bill.amount || ""),
    discount: bill.discount ? String(bill.discount) : "",
    replacement: bill.replacement ? String(bill.replacement) : "",
  }));
}

function getInitialPaymentMode(existingCollection?: LocalCollection) {
  return existingCollection?.bills[0]?.paymentMode || "cash";
}

function getInitialChequeDate(existingCollection?: LocalCollection) {
  return existingCollection?.bills.find((bill) => bill.paymentMode === "cheque")?.chequeDate || "";
}

function toNumber(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function formatAmount(value: number) {
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function LocalCollectionEntry({
  shop,
  salesPersonId,
  actorId,
  collectionType = "route",
  existingCollection,
  persistenceEnabled = true,
  onClose,
  onSaved,
}: LocalCollectionEntryProps) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(() =>
    getInitialPaymentMode(existingCollection),
  );
  const [chequeDate, setChequeDate] = useState(() => getInitialChequeDate(existingCollection));
  const [bills, setBills] = useState<EditableBill[]>(() =>
    getInitialBills(existingCollection),
  );
  const [step, setStep] = useState<CollectionEntryStep>("entry");
  const [message, setMessage] = useState<string | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const amountToCollect = useMemo(
    () => bills.reduce((total, bill) => total + toNumber(bill.amount), 0),
    [bills],
  );
  const discountTotal = useMemo(
    () => bills.reduce((total, bill) => total + toNumber(bill.discount), 0),
    [bills],
  );
  const replacementTotal = useMemo(
    () => bills.reduce((total, bill) => total + toNumber(bill.replacement), 0),
    [bills],
  );

  function updateBill(id: string, nextValue: Partial<EditableBill>) {
    setBills((currentBills) =>
      currentBills.map((bill) => (bill.id === id ? { ...bill, ...nextValue } : bill)),
    );
  }

  function handlePaymentModeChange(nextPaymentMode: PaymentMode) {
    setPaymentMode(nextPaymentMode);
    setBills((currentBills) =>
      currentBills.map((bill) => ({
        ...bill,
        paymentMode: nextPaymentMode,
        chequeDate: nextPaymentMode === "cheque" ? chequeDate || bill.chequeDate || "" : null,
      })),
    );

    if (nextPaymentMode !== "cheque") {
      setChequeDate("");
    }
  }

  function handleChequeDateChange(nextChequeDate: string) {
    setChequeDate(nextChequeDate);
    setBills((currentBills) =>
      currentBills.map((bill) => ({
        ...bill,
        chequeDate: paymentMode === "cheque" ? nextChequeDate : null,
      })),
    );
  }

  function removeBill(id: string) {
    setBills((currentBills) => currentBills.filter((bill) => bill.id !== id));
  }

  function getValidatedBills() {
    return bills.map((bill) => ({
      ...bill,
      billNumber: bill.billNumber.trim(),
      notes: bill.notes.trim(),
      amount: toNumber(bill.amount),
      discount: toNumber(bill.discount),
      replacement: toNumber(bill.replacement),
      paymentMode,
      chequeDate: paymentMode === "cheque" ? chequeDate || null : null,
    }));
  }

  function validateBills() {
    const nextBills = getValidatedBills();
    const invalidBill = nextBills.find(
      (bill) =>
        !bill.billDate ||
        !bill.billNumber ||
        bill.amount <= 0 ||
        (paymentMode === "cheque" && !bill.chequeDate),
    );

    if (!nextBills.length || invalidBill) {
      setMessage("Enter bill date, bill number, amount, and cheque date when needed.");
      return null;
    }

    return nextBills;
  }

  function handleNext() {
    const nextBills = validateBills();

    if (!nextBills) {
      return;
    }

    setMessage(null);
    setStep("preview");
  }

  function handleSave() {
    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Saving is disabled to protect live data.");
      return;
    }

    const nextBills = validateBills();

    if (!nextBills) {
      return;
    }

    const collection = buildLocalCollection({
      existingCollection,
      shopId: shop.id,
      salesPersonId,
      collectionType: existingCollection?.collectionType || collectionType,
      bills: nextBills,
    });

    try {
      const commitResult = commitCoreCollection(collection, actorId || salesPersonId);

      if (commitResult.recoveryWarning) {
        window.alert(commitResult.recoveryWarning);
      }

      onSaved(collection);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to protect this collection for sync.");
    }
  }

  function openQrModal() {
    setQrImageFailed(false);
    setIsQrOpen(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/50 p-3 sm:items-center sm:p-4">
      <section className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white p-3 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 pb-2">
          <div>
            <h2 className="text-xl font-bold text-stone-900">
              {existingCollection
                ? "Edit Collection"
                : collectionType === "adhoc"
                  ? "Add Adhoc Collection"
                  : "Add Collection"}
            </h2>
            <p className="mt-1 text-sm font-medium text-stone-600">{shop.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-3 font-bold text-stone-600 shadow-sm transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
            aria-label="Close collection entry"
          >
            Close
          </button>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {!persistenceEnabled ? (
          <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-900">
            Preview mode is active. You can test this form, but saving is disabled to protect live data.
          </p>
        ) : null}

        {step === "entry" ? (
        <>
        <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="text-sm font-semibold text-slate-800">Payment Type</span>
              <select
                value={paymentMode}
                onChange={(event) => handlePaymentModeChange(event.target.value as PaymentMode)}
                className="mt-2 w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-base text-slate-900"
              >
                {paymentModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {paymentModeLabels[mode]}
                  </option>
                ))}
              </select>
            </label>
            {paymentMode === "cheque" ? (
              <label className="block min-w-0">
                <span className="text-sm font-semibold text-slate-800">Cheque date</span>
                <input
                  type="date"
                  value={chequeDate}
                  onChange={(event) => handleChequeDateChange(event.target.value)}
                  className="mt-2 w-full rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                />
              </label>
            ) : null}
            {paymentMode === "upi" ? (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={openQrModal}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  Show QR
                </button>
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-xs font-medium text-stone-600">
            This payment mode applies to every bill in this collection.
          </p>
        </div>

        <div className="space-y-3">
          {bills.map((bill, index) => (
            <div key={bill.id} className="rounded-lg border border-orange-200 bg-orange-50/20 p-2.5">
              {bills.length > 1 ? (
                <h3 className="mb-2 text-sm font-bold text-stone-900">Bill {index + 1}</h3>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0">
                  <span className="text-sm font-semibold text-slate-800">Bill date</span>
                  <input
                    type="date"
                    value={bill.billDate}
                    onChange={(event) => updateBill(bill.id, { billDate: event.target.value })}
                    className="mt-2 w-full rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-sm font-semibold text-slate-800">Bill number</span>
                  <input
                    type="text"
                    value={bill.billNumber}
                    onChange={(event) => updateBill(bill.id, { billNumber: event.target.value })}
                    className="mt-2 w-full rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-sm font-semibold text-slate-800">Amount (Rs.)</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={bill.amount}
                    onChange={(event) => updateBill(bill.id, { amount: event.target.value })}
                    className="mt-2 w-full rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-sm font-semibold text-slate-800">Discount (Rs.)</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={bill.discount}
                    onChange={(event) => updateBill(bill.id, { discount: event.target.value })}
                    className="mt-2 w-full rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-sm font-semibold text-slate-800">Replacement (Rs.)</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={bill.replacement}
                    onChange={(event) => updateBill(bill.id, { replacement: event.target.value })}
                    className="mt-2 w-full rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                  />
                </label>
                <label className="col-span-2 block min-w-0">
                  <span className="text-sm font-semibold text-slate-800">Note</span>
                  <textarea
                    value={bill.notes}
                    onChange={(event) => updateBill(bill.id, { notes: event.target.value })}
                    rows={2}
                    placeholder="Optional note for this bill"
                    className="mt-2 w-full resize-none rounded-md border border-orange-200 px-3 py-2 text-base text-slate-900"
                  />
                </label>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bills.length === 1}
                  onClick={() => removeBill(bill.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3">
              <p className="text-sm font-bold text-stone-900">Collection preview</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="font-semibold text-stone-500">Payment mode</p>
                  <p className="mt-1 font-bold text-stone-900">{paymentModeLabels[paymentMode]}</p>
                </div>
                {paymentMode === "cheque" ? (
                  <div>
                    <p className="font-semibold text-stone-500">Cheque date</p>
                    <p className="mt-1 font-bold text-stone-900">{chequeDate}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-orange-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-orange-50 text-stone-800">
                  <tr>
                    <th className="px-3 py-2 font-bold">Bill</th>
                    <th className="px-3 py-2 text-right font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {getValidatedBills().map((bill, index) => (
                    <tr key={bill.id} className="border-t border-orange-100">
                      <td className="px-3 py-2">
                        <p className="font-bold text-stone-900">{bill.billNumber}</p>
                        <p className="mt-1 text-xs text-stone-600">{bill.billDate}</p>
                        {bill.notes ? (
                          <p className="mt-1 whitespace-pre-wrap text-xs font-medium text-stone-700">
                            Note: {bill.notes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-stone-900">
                        {formatAmount(bill.amount)}
                        <p className="mt-1 text-xs font-medium text-stone-500">#{index + 1}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-orange-200 bg-white px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-stone-600">Discount</span>
                <span className="font-bold text-stone-900">{formatAmount(discountTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-stone-600">Replacement</span>
                <span className="font-bold text-stone-900">{formatAmount(replacementTotal)}</span>
              </div>
            </div>
          </div>
        )}

        {message ? <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">{message}</p> : null}

        <div className="mt-3 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-3">
          <p className="text-sm font-bold text-stone-800">Amount to be collected</p>
          <p className="text-base font-bold text-stone-950">Rs. {amountToCollect.toFixed(2)}</p>
        </div>

        {step === "entry" ? (
        <div className="mt-4 flex flex-row gap-2">
          <button
            type="button"
            onClick={() =>
              setBills((currentBills) => [
                ...currentBills,
                createEmptyBill(paymentMode, paymentMode === "cheque" ? chequeDate : null),
              ])
            }
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 font-bold text-stone-800 shadow-sm transition-colors hover:bg-orange-100"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add Bill
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-orange-700"
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Next
          </button>
        </div>
        ) : (
          <div className="mt-4 flex flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setStep("entry");
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 font-bold text-stone-800 shadow-sm transition-colors hover:bg-orange-100"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              disabled={!persistenceEnabled}
              onClick={handleSave}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              Save Collection
            </button>
          </div>
        )}
        </div>
      </section>
      {isQrOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/60 p-4" role="dialog" aria-modal="true" aria-label="UPI payment QR code">
          <div className="relative w-full max-w-xs rounded-lg bg-white p-4 shadow-xl">
            <button
              type="button"
              onClick={() => setIsQrOpen(false)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50"
              aria-label="Close QR code"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 className="pr-10 text-lg font-bold text-stone-900">UPI QR Code</h3>
            <div className="mt-4 grid place-items-center rounded-lg border border-stone-200 bg-stone-50 p-3">
              {qrImageFailed ? (
                <p className="py-10 text-center text-sm font-semibold text-stone-600">
                  Add the QR image at public/icons/upi-qr.jpeg.
                </p>
              ) : (
                <Image
                  src={upiQrImagePath}
                  alt="UPI payment QR code"
                  width={192}
                  height={192}
                  onError={() => setQrImageFailed(true)}
                  className="h-48 w-48 object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
