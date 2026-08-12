import {
  setLocalStorageJsonWithMaintenance,
} from "@/lib/browser/storage-maintenance";
import { localOrdersStorageKey } from "@/lib/browser/storage-keys";
import type { LocalOrder, LocalOrderItem, LocalProductSku } from "@/types/domain";

export { localOrdersStorageKey };

const gstRate = 0.05;

export function readLocalOrders(_revision = 0) {
  void _revision;

  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(localOrdersStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as LocalOrder[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalOrder(order: LocalOrder) {
  const orders = readLocalOrders().filter((item) => item.id !== order.id);
  setLocalStorageJsonWithMaintenance(localOrdersStorageKey, [...orders, order]);
}

export function deleteLocalOrder(orderId: string) {
  const orders = readLocalOrders().filter((item) => item.id !== orderId);
  setLocalStorageJsonWithMaintenance(localOrdersStorageKey, orders);
}

export function buildLocalOrderItems(
  productSkus: LocalProductSku[],
  quantitiesBySkuId: Record<string, number>,
) {
  return productSkus
    .map((sku): LocalOrderItem | null => {
      const quantity = Number(quantitiesBySkuId[sku.id] || 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }

      return {
        skuId: sku.id,
        productId: sku.productId,
        productName: sku.productName,
        skuSize: sku.skuSize,
        skuCode: sku.skuCode,
        rate: sku.rate,
        mrp: sku.mrp,
        quantity,
        lineTotal: Math.round(sku.rate * quantity * 100) / 100,
      };
    })
    .filter((item): item is LocalOrderItem => item !== null);
}

export function buildLocalOrder(input: {
  existingOrder?: LocalOrder;
  shopId: string;
  salesPersonId: string;
  orderType?: "route" | "adhoc";
  visitPosition?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
  } | null;
  items: LocalOrderItem[];
  notes: string;
  replacementNotes: string;
}) {
  const subtotal = Math.round(input.items.reduce((total, item) => total + item.lineTotal, 0) * 100) / 100;
  const gstAmount = Math.round(subtotal * gstRate * 100) / 100;
  const now = new Date().toISOString();

  return {
    id: input.existingOrder?.id || crypto.randomUUID(),
    shopId: input.shopId,
    salesPersonId: input.salesPersonId,
    orderType: input.existingOrder?.orderType || input.orderType || ("route" as const),
    status: input.existingOrder ? ("updated" as const) : ("placed" as const),
    notes: input.notes,
    replacementNotes: input.replacementNotes,
    subtotal,
    gstRate,
    gstAmount,
    grandTotal: Math.round((subtotal + gstAmount) * 100) / 100,
    items: input.items,
    visitLat: input.visitPosition?.latitude ?? input.existingOrder?.visitLat ?? null,
    visitLng: input.visitPosition?.longitude ?? input.existingOrder?.visitLng ?? null,
    visitAccuracy: input.visitPosition?.accuracy ?? input.existingOrder?.visitAccuracy ?? null,
    visitCapturedAt: input.visitPosition?.capturedAt ?? input.existingOrder?.visitCapturedAt ?? null,
    createdAt: input.existingOrder?.createdAt || now,
    updatedAt: now,
  };
}
