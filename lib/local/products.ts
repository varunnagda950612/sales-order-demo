import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalProductSku } from "@/types/domain";

export const localProductsStorageKey = "manish-masala-next.local-product-skus.v1";

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
};

type SkuRow = {
  id: string;
  product_id: string;
  sku_size: string;
  sku_code: string | null;
  rate: number | string | null;
  mrp: number | string | null;
};

function toNumber(value: number | string | null) {
  const parsedValue = Number(value || 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function readLocalProductSkus() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(localProductsStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as LocalProductSku[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalProductSkus(productSkus: LocalProductSku[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localProductsStorageKey, JSON.stringify(productSkus));
}

export function upsertLocalProductSku(productSku: LocalProductSku) {
  const productSkus = readLocalProductSkus().filter((item) => item.id !== productSku.id);
  writeLocalProductSkus(
    [...productSkus, productSku].sort(
      (a, b) => a.productName.localeCompare(b.productName) || a.skuSize.localeCompare(b.skuSize),
    ),
  );
}

export function deleteLocalProductSku(productSkuId: string) {
  const productSkus = readLocalProductSkus().filter((item) => item.id !== productSkuId);
  writeLocalProductSkus(productSkus);
}

export async function seedLocalProductSkus(supabase: SupabaseClient) {
  const [{ data: productsData, error: productsError }, { data: skusData, error: skusError }] =
    await Promise.all([
      supabase.from("products").select("id, name, category, photo_url").eq("active", true),
      supabase
        .from("product_skus")
        .select("id, product_id, sku_size, sku_code, rate, mrp")
        .eq("active", true),
    ]);

  if (productsError) {
    throw new Error(productsError.message);
  }

  if (skusError) {
    throw new Error(skusError.message);
  }

  const productsById = new Map((productsData || []).map((product) => [product.id, product as ProductRow]));
  const productSkus = ((skusData || []) as SkuRow[])
    .map((sku) => {
      const product = productsById.get(sku.product_id);

      if (!product) {
        return null;
      }

      return {
        id: sku.id,
        productId: sku.product_id,
        productName: product.name,
        category: product.category,
        photoUrl: product.photo_url,
        skuSize: sku.sku_size,
        skuCode: sku.sku_code,
        rate: toNumber(sku.rate),
        mrp: toNumber(sku.mrp),
      };
    })
    .filter((sku): sku is LocalProductSku => sku !== null)
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.skuSize.localeCompare(b.skuSize));

  writeLocalProductSkus(productSkus);
  return productSkus;
}
