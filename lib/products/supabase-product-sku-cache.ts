import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseProductSkus } from "@/lib/repositories/supabase-read";
import type { LocalProductSku } from "@/types/domain";

const productSkuCacheMaxAgeMs = 5 * 60 * 1000;

let cachedProductSkus:
  | {
      expiresAt: number;
      productSkus: LocalProductSku[];
    }
  | null = null;
let pendingProductSkuRead: Promise<LocalProductSku[]> | null = null;

export async function readCachedSupabaseProductSkus(supabase: SupabaseClient) {
  const now = Date.now();

  if (cachedProductSkus && cachedProductSkus.expiresAt > now) {
    return cachedProductSkus.productSkus;
  }

  if (pendingProductSkuRead) {
    return pendingProductSkuRead;
  }

  pendingProductSkuRead = readSupabaseProductSkus(supabase)
    .then((productSkus) => {
      cachedProductSkus = {
        expiresAt: Date.now() + productSkuCacheMaxAgeMs,
        productSkus,
      };
      return productSkus;
    })
    .finally(() => {
      pendingProductSkuRead = null;
    });

  return pendingProductSkuRead;
}

export function clearCachedSupabaseProductSkus() {
  cachedProductSkus = null;
  pendingProductSkuRead = null;
}
