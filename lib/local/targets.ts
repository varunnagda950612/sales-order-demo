import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalSalesTarget } from "@/types/domain";

export const localTargetsStorageKey = "manish-masala-next.local-sales-targets.v1";

type SalesTargetRow = {
  id: string;
  sales_person_id: string;
  product_id: string | null;
  product_sku_id: string | null;
  product_name: string;
  sku_size: string;
  sku_code: string | null;
  grams: number | string | null;
  target_kg: number | string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

function toNumber(value: number | string | null) {
  const parsedValue = Number(value || 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function toLocalSalesTarget(
  target: SalesTargetRow,
  remapSalesPerson?: { fromSalesPersonId: string; toSalesPersonId: string },
): LocalSalesTarget {
  return {
    id: target.id,
    salesPersonId:
      remapSalesPerson && target.sales_person_id === remapSalesPerson.fromSalesPersonId
        ? remapSalesPerson.toSalesPersonId
        : target.sales_person_id,
    productId: target.product_id,
    productSkuId: target.product_sku_id,
    productName: target.product_name,
    skuSize: target.sku_size,
    skuCode: target.sku_code,
    grams: toNumber(target.grams),
    targetKg: toNumber(target.target_kg),
    startDate: target.start_date,
    endDate: target.end_date,
    createdAt: target.created_at,
    updatedAt: target.updated_at,
  };
}

export function readLocalSalesTargets(_revision = 0) {
  void _revision;

  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(localTargetsStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as LocalSalesTarget[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalSalesTargets(targets: LocalSalesTarget[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localTargetsStorageKey, JSON.stringify(targets));
}

export function upsertLocalSalesTarget(target: LocalSalesTarget) {
  const targets = readLocalSalesTargets().filter((item) => item.id !== target.id);
  writeLocalSalesTargets([...targets, target]);
}

export function deleteLocalSalesTarget(targetId: string) {
  const targets = readLocalSalesTargets().filter((item) => item.id !== targetId);
  writeLocalSalesTargets(targets);
}

export function buildLocalSalesTarget(input: {
  existingTarget?: LocalSalesTarget;
  salesPersonId: string;
  productId: string | null;
  productSkuId: string | null;
  productName: string;
  skuSize: string;
  skuCode: string | null;
  grams: number;
  targetKg: number;
  startDate: string;
  endDate: string;
}) {
  const now = new Date().toISOString();

  return {
    id: input.existingTarget?.id || crypto.randomUUID(),
    salesPersonId: input.salesPersonId,
    productId: input.productId,
    productSkuId: input.productSkuId,
    productName: input.productName,
    skuSize: input.skuSize,
    skuCode: input.skuCode,
    grams: input.grams,
    targetKg: input.targetKg,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: input.existingTarget?.createdAt || now,
    updatedAt: now,
  };
}

export async function seedLocalSalesTargets(
  supabase: SupabaseClient,
  salesPersonId: string,
  localSalesPersonId: string,
) {
  const { data, error } = await supabase
    .from("sales_targets")
    .select(
      "id, sales_person_id, product_id, product_sku_id, product_name, sku_size, sku_code, grams, target_kg, start_date, end_date, created_at, updated_at",
    )
    .eq("sales_person_id", salesPersonId)
    .order("end_date", { ascending: true })
    .order("product_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const targets = ((data || []) as SalesTargetRow[]).map((target) =>
    toLocalSalesTarget(target, {
      fromSalesPersonId: salesPersonId,
      toSalesPersonId: localSalesPersonId,
    }),
  );

  writeLocalSalesTargets(targets);
  return targets;
}
