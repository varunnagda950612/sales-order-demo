import { getIndiaDate, getUtcRangeForIndiaDate } from "@/lib/dates/india";
import type { LocalOrder, LocalOrderItem, LocalSalesTarget } from "@/types/domain";

export type TargetProgress = {
  target: LocalSalesTarget;
  completedKg: number;
  cappedCompletedKg: number;
  pendingKg: number;
  progressPercent: number;
};

export type TargetPeriod = "active" | "upcoming" | "previous";

export type TargetOrderDateRange = {
  startDate: string;
  endDate: string;
  createdAtFrom: string;
  createdAtTo: string;
};

export function isDateWithinRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

export function getOrderDate(order: LocalOrder) {
  return getIndiaDate(new Date(order.createdAt));
}

export function getTargetPeriod(target: LocalSalesTarget, today: string): TargetPeriod {
  if (target.startDate > today) {
    return "upcoming";
  }

  return target.endDate < today ? "previous" : "active";
}

export function getItemsKgForTarget(
  target: LocalSalesTarget,
  items: Pick<LocalOrderItem, "skuId" | "quantity">[],
) {
  const totalKg = items
    .filter((item) => item.skuId === target.productSkuId)
    .reduce((total, item) => total + (item.quantity * target.grams) / 1000, 0);

  return roundTargetKg(totalKg);
}

export function getCompletedKgForTarget(target: LocalSalesTarget, orders: LocalOrder[]) {
  const totalKg = orders.reduce((total, order) => {
    const orderDate = getOrderDate(order);

    if (!isDateWithinRange(orderDate, target.startDate, target.endDate)) {
      return total;
    }

    return total + getItemsKgForTarget(target, order.items);
  }, 0);

  return roundTargetKg(totalKg);
}

export function getTargetProgress(
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
    pendingKg: roundTargetKg(pendingKg),
    progressPercent: Math.round(progressPercent),
  };
}

export function getActiveTargetOrderDateRange(
  targets: LocalSalesTarget[],
  today = getIndiaDate(),
): TargetOrderDateRange | null {
  const activeTargets = targets.filter(
    (target) => getTargetPeriod(target, today) === "active",
  );

  if (!activeTargets.length) {
    return null;
  }

  const startDate = activeTargets.reduce(
    (earliest, target) => (target.startDate < earliest ? target.startDate : earliest),
    activeTargets[0].startDate,
  );
  const endDate = activeTargets.reduce(
    (latest, target) => (target.endDate > latest ? target.endDate : latest),
    activeTargets[0].endDate,
  );

  return {
    startDate,
    endDate,
    createdAtFrom: getUtcRangeForIndiaDate(startDate).start,
    createdAtTo: getUtcRangeForIndiaDate(endDate).end,
  };
}

export function roundTargetKg(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatTargetKg(value: number) {
  return `${roundTargetKg(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} kg`;
}

export function getProgressMessage(completedKg: number, targetKg: number) {
  if (targetKg <= 0) {
    return "Target setup needs correction.";
  }

  const percent = (completedKg / targetKg) * 100;

  if (percent >= 100) {
    return "Target completed.";
  }

  if (percent >= 75) {
    return "Close to completion.";
  }

  if (percent >= 40) {
    return "Good progress.";
  }

  return "Needs focus.";
}
