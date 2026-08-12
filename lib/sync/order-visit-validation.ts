import { getIndiaDate } from "@/lib/dates/india";
import type { LocalOrder } from "@/types/domain";

const staleOrderVisitMessage =
  "Orders require a same-day GPS visit. Please capture the shop location again before saving this order.";

function getOrderIndiaDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getIndiaDate(date);
}

export function assertNewOrderVisitIsSameDay(order: LocalOrder) {
  if (order.status !== "placed") {
    return;
  }

  const orderDate = getOrderIndiaDate(order.createdAt);
  const visitDate = getOrderIndiaDate(order.visitCapturedAt);

  if (!orderDate || !visitDate || orderDate !== visitDate) {
    throw new Error(staleOrderVisitMessage);
  }
}
