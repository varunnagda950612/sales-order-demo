"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Search, ShoppingCart, Store } from "lucide-react";
import { LocalCollectionEntry } from "./local-collection-entry";
import { LocalOrderEntry } from "./local-order-entry";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readCachedSupabaseProductSkus } from "@/lib/products/supabase-product-sku-cache";
import type { TargetProgress } from "@/lib/targets/progress";
import type { LocalProductSku, SalesRouteShop } from "@/types/domain";

type SalesAdhocOrderProps = {
  salesPersonId: string;
  shops: SalesRouteShop[];
  localMode?: boolean;
  productSkus?: LocalProductSku[];
  activeTargetProgress?: TargetProgress[];
  onOrderSaved: () => void;
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

function matchesSearch(shop: SalesRouteShop, searchValue: string) {
  const value = searchValue.trim().toLowerCase();

  if (!value) {
    return true;
  }

  return [shop.name, shop.area, shop.phone, shop.address]
    .filter(Boolean)
    .some((item) => item?.toLowerCase().includes(value));
}

export function SalesAdhocOrder({
  salesPersonId,
  shops,
  localMode = false,
  productSkus,
  activeTargetProgress = [],
  onOrderSaved,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: SalesAdhocOrderProps) {
  const [searchValue, setSearchValue] = useState("");
  const [selectedShop, setSelectedShop] = useState<SalesRouteShop | null>(null);
  const [loadedProductSkus, setLoadedProductSkus] = useState<LocalProductSku[] | null>(
    () => productSkus || null,
  );
  const [collectionShop, setCollectionShop] = useState<SalesRouteShop | null>(
    null,
  );
  const [visitPosition, setVisitPosition] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [capturingShopId, setCapturingShopId] = useState<string | null>(null);
  const router = useRouter();
  const visibleShops = useMemo(
    () =>
      shops
        .filter((shop) => shop.assignedTo === salesPersonId)
        .filter((shop) => matchesSearch(shop, searchValue))
        .slice(0, 80),
    [salesPersonId, searchValue, shops],
  );

  function handleSaved() {
    setSelectedShop(null);
    setVisitPosition(null);
    onOrderSaved();
  }

  function getBrowserPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported on this device."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location permission is required.")), {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      });
    });
  }

  async function handleStartOrder(shop: SalesRouteShop) {
    setMessage(null);
    setCapturingShopId(shop.id);

    try {
      const [position] = await Promise.all([
        getBrowserPosition(),
        loadedProductSkus || localMode
          ? Promise.resolve(loadedProductSkus)
          : readCachedSupabaseProductSkus(createSupabaseBrowserClient()).then((skus) => {
              setLoadedProductSkus(skus);
              return skus;
            }),
      ]);
      setVisitPosition({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date().toISOString(),
      });
      setSelectedShop(shop);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to capture location.");
    } finally {
      setCapturingShopId(null);
    }
  }

  return (
    <section id="adhoc-order" className="scroll-mt-32 space-y-4" aria-labelledby="adhoc-order-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-orange-100 p-2 text-orange-700">
            <PhoneCall className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-orange-700">Urgent phone order</p>
            <h2 id="adhoc-order-title" className="mt-1 text-2xl font-bold text-stone-900">
              Adhoc Order
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Select any assigned shop and create an order outside today&apos;s planned route.
            </p>
          </div>
        </div>
      </div>

      {!writesEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Live write protection is active.</p>
          <p className="mt-1">
            {mutationUiEnabled
              ? "Preview forms are available, but their final Save buttons are disabled."
              : "Adhoc orders and collections are visible only; new entries are disabled."}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm">
        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Search shops</span>
          <span className="mt-2 flex rounded-lg border border-stone-300 bg-white transition-colors focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-100">
            <Search className="ml-3 mt-2.5 h-4 w-4 text-stone-400" aria-hidden="true" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border-0 px-3 py-2 text-base text-stone-900 focus:outline-none"
              placeholder="Shop, area, phone"
            />
          </span>
        </label>
      </div>

      {message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{message}</p> : null}

      {visibleShops.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleShops.map((shop) => (
            <article key={shop.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-stone-900">{shop.name}</h3>
                  <p className="mt-1 text-sm font-medium text-stone-600">{shop.area}</p>
                  {shop.phone ? <p className="mt-1 text-sm text-stone-600">Phone: {shop.phone}</p> : null}
                  {shop.address ? <p className="mt-1 text-sm text-stone-600">{shop.address}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!mutationUiEnabled || capturingShopId === shop.id}
                    onClick={() => handleStartOrder(shop)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    {capturingShopId === shop.id ? "Capturing" : "Order"}
                  </button>
                  {mutationUiEnabled ? (
                    <button
                      type="button"
                      onClick={() => setCollectionShop(shop)}
                      className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
                    >
                      Collection
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-500"
                    >
                      Collection
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Store className="mx-auto h-8 w-8 text-stone-400" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-stone-900">No shops found</h3>
          <p className="mt-2 text-sm text-stone-600">
            Search by shop, area, or phone.
          </p>
        </div>
      )}

      {mutationUiEnabled && selectedShop ? (
        <LocalOrderEntry
          shop={selectedShop}
          salesPersonId={salesPersonId}
          productSkus={loadedProductSkus || undefined}
          activeTargetProgress={activeTargetProgress}
          orderType="adhoc"
          visitPosition={visitPosition}
          persistenceEnabled={writesEnabled}
          onClose={() => {
            setSelectedShop(null);
            setVisitPosition(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}

      {mutationUiEnabled && collectionShop ? (
        <LocalCollectionEntry
          shop={collectionShop}
          salesPersonId={salesPersonId}
          collectionType="adhoc"
          persistenceEnabled={writesEnabled}
          onClose={() => setCollectionShop(null)}
          onSaved={() => {
            setCollectionShop(null);
            router.replace("/sales", { scroll: false });
          }}
        />
      ) : null}
    </section>
  );
}
