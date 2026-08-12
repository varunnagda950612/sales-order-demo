"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { formatDateForDisplay, getIndiaDate } from "@/lib/dates/india";
import { readLocalOrders } from "@/lib/local/orders";
import { getSkuGrams } from "@/lib/orders/weights";
import { getUnsyncedOrders } from "@/lib/sync/core-outbox";
import { readLocalProductSkus } from "@/lib/local/products";
import { readLocalUsers } from "@/lib/local/users";
import {
  buildLocalSalesTarget,
  deleteLocalSalesTarget,
  readLocalSalesTargets,
  upsertLocalSalesTarget,
} from "@/lib/local/targets";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildUserNameMap, getSalespersonName } from "@/lib/users/display";
import type {
  AppRole,
  LocalOrder,
  LocalProductSku,
  LocalSalesTarget,
  UserProfile,
} from "@/types/domain";

type AdminTargetsProps = {
  role: Extract<AppRole, "admin" | "manager">;
  initialTargets?: LocalSalesTarget[];
  initialOrders?: LocalOrder[];
  initialProductSkus?: LocalProductSku[];
  initialUsers?: UserProfile[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

type TargetProgress = {
  target: LocalSalesTarget;
  completedKg: number;
  cappedCompletedKg: number;
  pendingKg: number;
  progressPercent: number;
};

type TargetPeriod = "active" | "upcoming" | "previous";

function isDateWithinRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function getCompletedKgForTarget(
  target: LocalSalesTarget,
  orders: LocalOrder[],
) {
  const totalGrams = orders.reduce((total, order) => {
    const orderDate = getIndiaDate(new Date(order.createdAt));

    if (
      order.salesPersonId !== target.salesPersonId ||
      !isDateWithinRange(orderDate, target.startDate, target.endDate)
    ) {
      return total;
    }

    return (
      total +
      order.items
        .filter((item) => item.skuId === target.productSkuId)
        .reduce(
          (itemTotal, item) => itemTotal + item.quantity * target.grams,
          0,
        )
    );
  }, 0);

  return Math.round((totalGrams / 1000) * 100) / 100;
}

function getTargetProgress(
  target: LocalSalesTarget,
  orders: LocalOrder[],
): TargetProgress {
  const completedKg = getCompletedKgForTarget(target, orders);
  const cappedCompletedKg = Math.min(completedKg, target.targetKg);
  const pendingKg = Math.max(target.targetKg - completedKg, 0);
  const progressPercent =
    target.targetKg > 0
      ? Math.min((completedKg / target.targetKg) * 100, 100)
      : 0;

  return {
    target,
    completedKg,
    cappedCompletedKg,
    pendingKg,
    progressPercent: Math.round(progressPercent),
  };
}

function toNumber(value: string) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

function matchesSearch(
  item: TargetProgress,
  salespersonName: string,
  value: string,
) {
  const searchValue = value.trim().toLowerCase();

  if (!searchValue) {
    return true;
  }

  return [
    salespersonName,
    item.target.productName,
    item.target.skuSize,
    item.target.skuCode,
  ]
    .filter(Boolean)
    .some((text) => text?.toLowerCase().includes(searchValue));
}

function getSkuLabel(sku: LocalProductSku) {
  return `${sku.productName} - ${sku.skuSize}${sku.skuCode ? ` - ${sku.skuCode}` : ""}`;
}

function matchesSkuSearch(sku: LocalProductSku, value: string) {
  const searchValue = value.trim().toLowerCase();

  if (!searchValue) {
    return true;
  }

  return [sku.productName, sku.skuSize, sku.skuCode]
    .filter(Boolean)
    .some((text) => text?.toLowerCase().includes(searchValue));
}

function getSalesUserOptions(users: UserProfile[], selectedSalesPersonId: string) {
  const salesUsers = users
    .filter(
      (user) =>
        user.role === "sales" &&
        (user.active || user.id === selectedSalesPersonId),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  if (
    selectedSalesPersonId &&
    !salesUsers.some((user) => user.id === selectedSalesPersonId)
  ) {
    salesUsers.push({
      id: selectedSalesPersonId,
      fullName: selectedSalesPersonId,
      role: "sales",
      loginId: selectedSalesPersonId,
      active: true,
      geofenceMeters: null,
    });
  }

  return salesUsers;
}

function getTargetPeriod(
  target: LocalSalesTarget,
  today: string,
): TargetPeriod {
  if (target.startDate > today) {
    return "upcoming";
  }

  return target.endDate < today ? "previous" : "active";
}

function TargetProgressTable({
  rows,
  canShowMutations,
  canOpenMutationUi,
  canMutate,
  userNameById,
  onEdit,
  onDelete,
}: {
  rows: TargetProgress[];
  canShowMutations: boolean;
  canOpenMutationUi: boolean;
  canMutate: boolean;
  userNameById: Map<string, string>;
  onEdit: (target: LocalSalesTarget) => void;
  onDelete: (targetId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2">Salesperson</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Date Range</th>
            <th className="px-3 py-2 text-right">Target</th>
            <th className="px-3 py-2 text-right">Completed</th>
            <th className="px-3 py-2 text-right">Pending</th>
            <th className="px-3 py-2 text-right">Progress</th>
            {canShowMutations ? (
              <th className="px-3 py-2 text-right">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.target.id} className="border-t border-slate-200">
              <td className="px-3 py-2 font-semibold text-slate-900">
                {getSalespersonName(userNameById, item.target.salesPersonId)}
              </td>
              <td className="px-3 py-2">
                <p className="text-slate-900 font-semibold">
                  {item.target.productName}
                </p>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDateForDisplay(item.target.startDate)} to{" "}
                {formatDateForDisplay(item.target.endDate)}
              </td>
              <td className="px-3 py-2 text-right font-bold">
                {item.target.targetKg.toFixed(2)} kg
              </td>
              <td className="px-3 py-2 text-right text-emerald-700">
                {item.completedKg.toFixed(2)} kg
              </td>
              <td className="px-3 py-2 text-right text-amber-700">
                {item.pendingKg.toFixed(2)} kg
              </td>
              <td className="px-3 py-2 text-right font-bold">
                {item.progressPercent}%
              </td>
              {canShowMutations ? (
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={!canOpenMutationUi}
                      onClick={() => onEdit(item.target)}
                      className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-2 py-1 font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={!canMutate}
                      onClick={() => onDelete(item.target.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-red-200 px-2 py-1 font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TargetGroup({
  period,
  rows,
  isOpen,
  canShowMutations,
  canOpenMutationUi,
  canMutate,
  userNameById,
  onToggle,
  onEdit,
  onDelete,
}: {
  period: TargetPeriod;
  rows: TargetProgress[];
  isOpen: boolean;
  canShowMutations: boolean;
  canOpenMutationUi: boolean;
  canMutate: boolean;
  userNameById: Map<string, string>;
  onToggle: () => void;
  onEdit: (target: LocalSalesTarget) => void;
  onDelete: (targetId: string) => void;
}) {
  const labels: Record<TargetPeriod, string> = {
    active: "Active Targets",
    upcoming: "Upcoming Targets",
    previous: "Previous Targets",
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <ChevronRight
            className={`h-5 w-5 transition-transform ${isOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          {labels[period]} ({rows.length})
        </span>
      </button>
      {isOpen ? (
        rows.length ? (
          <TargetProgressTable
            rows={rows}
            canShowMutations={canShowMutations}
            canOpenMutationUi={canOpenMutationUi}
            canMutate={canMutate}
            userNameById={userNameById}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <p className="border-t border-slate-200 px-4 py-5 text-sm text-slate-600">
            No {period === "active" ? "active" : period} targets match the
            current filters.
          </p>
        )
      ) : null}
    </section>
  );
}

function TargetEditor({
  target,
  productSkus,
  users,
  defaultSalesPersonId,
  persistenceEnabled,
  useSupabase,
  onClose,
  onSaved,
}: {
  target?: LocalSalesTarget;
  productSkus: LocalProductSku[];
  users: UserProfile[];
  defaultSalesPersonId: string;
  persistenceEnabled: boolean;
  useSupabase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [salesPersonId, setSalesPersonId] = useState(
    target?.salesPersonId || defaultSalesPersonId,
  );
  const [selectedSkuId, setSelectedSkuId] = useState(
    target?.productSkuId || productSkus[0]?.id || "",
  );
  const [skuSearchValue, setSkuSearchValue] = useState("");
  const [isSkuDropdownOpen, setIsSkuDropdownOpen] = useState(false);
  const [fallbackGrams, setFallbackGrams] = useState(
    target?.grams ? String(target.grams) : "",
  );
  const [targetKg, setTargetKg] = useState(
    target?.targetKg ? String(target.targetKg) : "",
  );
  const [startDate, setStartDate] = useState(
    target?.startDate || getIndiaDate(),
  );
  const [endDate, setEndDate] = useState(target?.endDate || getIndiaDate());
  const [message, setMessage] = useState<string | null>(null);
  const skuDropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedSku = productSkus.find((sku) => sku.id === selectedSkuId);
  const selectedSkuGrams = selectedSku ? getSkuGrams(selectedSku.skuSize) : 0;
  const gramsValue = selectedSkuGrams || toNumber(fallbackGrams);
  const salesUsers = useMemo(
    () => getSalesUserOptions(users, salesPersonId),
    [salesPersonId, users],
  );
  const visibleProductSkus = useMemo(
    () =>
      productSkus
        .filter((sku) => matchesSkuSearch(sku, skuSearchValue))
        .slice(0, 100),
    [productSkus, skuSearchValue],
  );

  useEffect(() => {
    if (!isSkuDropdownOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        skuDropdownRef.current &&
        !skuDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSkuDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSkuDropdownOpen]);

  async function handleSave() {
    if (!persistenceEnabled) {
      setMessage(
        "Preview mode is active. Saving is disabled to protect live data.",
      );
      return;
    }

    if (
      !salesPersonId.trim() ||
      !selectedSku ||
      gramsValue <= 0 ||
      toNumber(targetKg) <= 0 ||
      !startDate ||
      !endDate
    ) {
      setMessage(
        "Select salesperson, SKU, target KG, start date, and end date.",
      );
      return;
    }

    if (endDate < startDate) {
      setMessage("End date cannot be before start date.");
      return;
    }

    if (!window.confirm(target ? "Update this target?" : "Save this target?")) {
      return;
    }

    const nextTarget = buildLocalSalesTarget({
      existingTarget: target,
      salesPersonId: salesPersonId.trim(),
      productId: selectedSku.productId,
      productSkuId: selectedSku.id,
      productName: selectedSku.productName,
      skuSize: selectedSku.skuSize,
      skuCode: selectedSku.skuCode,
      grams: gramsValue,
      targetKg: toNumber(targetKg),
      startDate,
      endDate,
    });

    if (useSupabase) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("sales_targets").upsert({
        id: nextTarget.id,
        sales_person_id: nextTarget.salesPersonId,
        product_id: nextTarget.productId,
        product_sku_id: nextTarget.productSkuId,
        product_name: nextTarget.productName,
        sku_size: nextTarget.skuSize,
        sku_code: nextTarget.skuCode,
        grams: nextTarget.grams,
        target_kg: nextTarget.targetKg,
        start_date: nextTarget.startDate,
        end_date: nextTarget.endDate,
      });

      if (error) {
        setMessage(error.message);
        return;
      }
    } else {
      upsertLocalSalesTarget(nextTarget);
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-4">
      <section className="mx-auto w-full max-w-3xl rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-sm font-semibold text-amber-700">SKU target</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {target ? "Edit Target" : "Add Target"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Close target editor"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
          <label className="block">
            <div className="text-sm font-semibold text-slate-800">
              Salesperson
            </div>
            <select
              value={salesPersonId}
              onChange={(event) => setSalesPersonId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="">Select salesperson</option>
              {salesUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                  {user.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <div className="block">
            <div className="text-sm font-semibold text-slate-800">
              Product SKU
            </div>
            <div ref={skuDropdownRef} className="relative mt-2">
              <button
                type="button"
                aria-expanded={isSkuDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setIsSkuDropdownOpen((value) => !value)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-base text-slate-900 transition-colors hover:border-orange-300 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
              >
                <span className="min-w-0 flex-1 truncate">
                  {selectedSku ? getSkuLabel(selectedSku) : "Select SKU"}
                </span>
                <ChevronRight
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                    isSkuDropdownOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {isSkuDropdownOpen ? (
                <div className="absolute left-0 right-0 z-50 mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                  <span className="flex rounded-md border border-slate-300 bg-white focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-100">
                    <Search
                      className="ml-3 mt-2.5 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      autoFocus
                      value={skuSearchValue}
                      onChange={(event) => setSkuSearchValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setIsSkuDropdownOpen(false);
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border-0 px-3 py-2 text-base text-slate-900 focus:outline-none"
                      placeholder="Search SKU name, size, code"
                    />
                  </span>

                  <div
                    role="listbox"
                    className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-100"
                  >
                    {visibleProductSkus.length ? (
                      visibleProductSkus.map((sku) => {
                        const isSelected = sku.id === selectedSkuId;

                        return (
                          <button
                            key={sku.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setSelectedSkuId(sku.id);
                              setFallbackGrams("");
                              setSkuSearchValue("");
                              setIsSkuDropdownOpen(false);
                            }}
                            className={`block w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors hover:bg-orange-50 ${
                              isSelected
                                ? "bg-orange-50 font-bold text-orange-800"
                                : "text-slate-800"
                            }`}
                          >
                            <span className="block font-semibold">
                              {sku.productName}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {sku.skuSize}
                              {sku.skuCode ? ` - ${sku.skuCode}` : ""}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-3 py-4 text-sm text-slate-500">
                        No SKU found.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <label className="block">
            <div className="text-sm font-semibold text-slate-800">
              KG conversion
            </div>
            {selectedSkuGrams > 0 ? (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-base font-bold text-emerald-800">
                {selectedSkuGrams} gm per piece from {selectedSku?.skuSize}
              </div>
            ) : (
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={fallbackGrams}
                onChange={(event) => setFallbackGrams(event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                placeholder="Enter grams if SKU size cannot be detected"
              />
            )}
            <p className="mt-1 text-xs text-slate-500">
              Used to convert ordered pieces into KG target progress.
            </p>
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-slate-800">
              Target KG
            </div>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={targetKg}
              onChange={(event) => setTargetKg(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-slate-800">
              Start date
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-slate-800">
              End date
            </div>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
        </div>

        {message ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        ) : null}
        {!persistenceEnabled ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Preview mode is active. You can test this form, but saving is
            disabled to protect live data.
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!persistenceEnabled}
            onClick={() => void handleSave()}
            className="rounded-md bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Save Target
          </button>
        </div>
      </section>
    </div>
  );
}

export function AdminTargets({
  role,
  initialTargets,
  initialOrders,
  initialProductSkus,
  initialUsers,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: AdminTargetsProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [selectedSalesperson, setSelectedSalesperson] = useState("all");
  const [openPeriod, setOpenPeriod] = useState<TargetPeriod | null>("active");
  const [editingTarget, setEditingTarget] = useState<LocalSalesTarget | null>(
    null,
  );
  const [isAdding, setIsAdding] = useState(false);
  const targets = initialTargets || readLocalSalesTargets(refreshKey);
  const orders = useMemo(() => {
    const orderById = new Map<string, LocalOrder>();

    (initialOrders || readLocalOrders(refreshKey)).forEach((order) => {
      orderById.set(order.id, order);
    });
    getUnsyncedOrders().forEach((order) => {
      orderById.set(order.id, order);
    });

    return Array.from(orderById.values()).filter(
      (order) => order.status !== "cancelled",
    );
  }, [initialOrders, refreshKey]);
  const productSkus = initialProductSkus || readLocalProductSkus();
  const users = initialUsers || readLocalUsers(refreshKey);
  const userNameById = useMemo(() => buildUserNameMap(users), [users]);
  const canShowMutations = role === "admin";
  const canMutate = role === "admin" && writesEnabled;
  const canOpenMutationUi = role === "admin" && mutationUiEnabled;
  const useSupabase = initialTargets !== undefined;
  const today = getIndiaDate();
  const filteredProgressRows = useMemo(
    () =>
      targets
        .map((target) => getTargetProgress(target, orders))
        .filter(
          (item) =>
            selectedSalesperson === "all" ||
            item.target.salesPersonId === selectedSalesperson,
        )
        .filter((item) =>
          matchesSearch(
            item,
            getSalespersonName(userNameById, item.target.salesPersonId),
            searchValue,
          ),
        )
        .sort(
          (a, b) =>
            getSalespersonName(
              userNameById,
              a.target.salesPersonId,
            ).localeCompare(
              getSalespersonName(userNameById, b.target.salesPersonId),
            ) ||
            a.target.endDate.localeCompare(b.target.endDate) ||
            a.target.productName.localeCompare(b.target.productName),
        ),
    [orders, searchValue, selectedSalesperson, targets, userNameById],
  );
  const targetsByPeriod = useMemo(
    () =>
      filteredProgressRows.reduce<Record<TargetPeriod, TargetProgress[]>>(
        (groups, item) => {
          groups[getTargetPeriod(item.target, today)].push(item);
          return groups;
        },
        { active: [], upcoming: [], previous: [] },
      ),
    [filteredProgressRows, today],
  );
  const salespersonOptions = useMemo(() => {
    const salesPersonIds = new Set<string>();

    users
      .filter((user) => user.role === "sales" && user.active)
      .forEach((user) => salesPersonIds.add(user.id));
    targets.forEach((target) => salesPersonIds.add(target.salesPersonId));

    return Array.from(salesPersonIds).sort((a, b) =>
      getSalespersonName(userNameById, a).localeCompare(
        getSalespersonName(userNameById, b),
      ),
    );
  }, [targets, userNameById, users]);
  const summary = targetsByPeriod.active.reduce(
    (total, item) => ({
      targetKg: total.targetKg + item.target.targetKg,
      completedKg: total.completedKg + item.cappedCompletedKg,
      pendingKg: total.pendingKg + item.pendingKg,
    }),
    { targetKg: 0, completedKg: 0, pendingKg: 0 },
  );
  const completionPercent = summary.targetKg
    ? Math.round((summary.completedKg / summary.targetKg) * 100)
    : 0;
  const defaultSalesPersonId = salespersonOptions[0] || "sales-local-user";

  function handleSaved() {
    setRefreshKey((value) => value + 1);
    if (useSupabase) {
      router.refresh();
    }
  }

  async function handleDelete(targetId: string) {
    if (!window.confirm("Delete this target?")) {
      return;
    }

    if (!canMutate) {
      return;
    }

    if (useSupabase) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sales_targets")
        .delete()
        .eq("id", targetId);

      if (error) {
        window.alert(`Target could not be deleted: ${error.message}`);
        return;
      }
    } else {
      deleteLocalSalesTarget(targetId);
    }

    handleSaved();
  }

  return (
    <section
      id="targets"
      className="space-y-4 scroll-mt-32"
      aria-labelledby="admin-targets-title"
    >
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="admin-targets-title"
              className="mt-1 text-2xl font-bold text-stone-900"
            >
              Target Overview
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              SKU targets are calculated from order pieces converted to KG.
            </p>
          </div>
          {canShowMutations ? (
            <button
              type="button"
              disabled={!canOpenMutationUi}
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              Add Target
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Search</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
              placeholder="Salesperson, product, SKU"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Salesperson
            </span>
            <select
              value={selectedSalesperson}
              onChange={(event) => setSelectedSalesperson(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="all">All</option>
              {salespersonOptions.map((salesPersonId) => (
                <option key={salesPersonId} value={salesPersonId}>
                  {getSalespersonName(userNameById, salesPersonId)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-3">
            <p className="text-xs font-semibold uppercase text-stone-500">
              Total target
            </p>
            <p className="mt-1 text-xl font-bold text-stone-900">
              {summary.targetKg.toFixed(1)} kg
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase text-emerald-700">
              Completed
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-800">
              {summary.completedKg.toFixed(1)} kg
            </p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase text-orange-700">
              Pending
            </p>
            <p className="mt-1 text-xl font-bold text-orange-800">
              {summary.pendingKg.toFixed(1)} kg
            </p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase text-sky-700">
              Completion
            </p>
            <p className="mt-1 text-xl font-bold text-sky-800">
              {completionPercent}%
            </p>
          </div>
        </div>
      </div>

      {(["active", "upcoming", "previous"] as const).map((period) => (
        <TargetGroup
          key={period}
          period={period}
          rows={targetsByPeriod[period]}
          isOpen={openPeriod === period}
          canShowMutations={canShowMutations}
          canOpenMutationUi={canOpenMutationUi}
          canMutate={canMutate}
          userNameById={userNameById}
          onToggle={() =>
            setOpenPeriod((current) => (current === period ? null : period))
          }
          onEdit={setEditingTarget}
          onDelete={handleDelete}
        />
      ))}

      {isAdding ? (
        <TargetEditor
          productSkus={productSkus}
          users={users}
          defaultSalesPersonId={defaultSalesPersonId}
          persistenceEnabled={canMutate}
          useSupabase={useSupabase}
          onClose={() => setIsAdding(false)}
          onSaved={handleSaved}
        />
      ) : null}

      {editingTarget ? (
        <TargetEditor
          target={editingTarget}
          productSkus={productSkus}
          users={users}
          defaultSalesPersonId={editingTarget.salesPersonId}
          persistenceEnabled={canMutate}
          useSupabase={useSupabase}
          onClose={() => setEditingTarget(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}
