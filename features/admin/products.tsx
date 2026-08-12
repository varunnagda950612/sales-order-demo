"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Package, Plus, Trash2 } from "lucide-react";
import { deleteLocalProductSku, readLocalProductSkus, upsertLocalProductSku } from "@/lib/local/products";
import { sortProductSkusForDisplay } from "@/lib/products/display-order";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole, LocalProductSku } from "@/types/domain";

type AdminProductsProps = {
  role: Extract<AppRole, "admin" | "manager">;
  initialProductSkus?: LocalProductSku[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

function toNumber(value: string) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
}

function matchesSearch(sku: LocalProductSku, value: string) {
  const searchValue = value.trim().toLowerCase();

  if (!searchValue) {
    return true;
  }

  return [sku.productName, sku.category, sku.skuSize, sku.skuCode]
    .filter(Boolean)
    .some((item) => item?.toLowerCase().includes(searchValue));
}

function formatBrand(category: string | null | undefined) {
  const brand = String(category || "").trim();
  const compactBrand = brand.replace(/\s+/g, "").toLowerCase();

  if (compactBrand === "spiceleaf") {
    return "SPICELEAF";
  }

  return brand || "Unbranded";
}

function ProductImage({ sku }: { sku: LocalProductSku }) {
  if (!sku.photoUrl) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
        <Package className="h-6 w-6 text-slate-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    // Product image URLs are user-managed and may use different storage hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sku.photoUrl}
      alt={sku.productName}
      loading="lazy"
      decoding="async"
      className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-contain"
    />
  );
}

function ProductEditor({
  sku,
  persistenceEnabled,
  useSupabase,
  onClose,
  onSaved,
}: {
  sku?: LocalProductSku;
  persistenceEnabled: boolean;
  useSupabase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productName, setProductName] = useState(sku?.productName || "");
  const [category, setCategory] = useState(sku?.category || "MANISH");
  const [skuSize, setSkuSize] = useState(sku?.skuSize || "");
  const [skuCode, setSkuCode] = useState(sku?.skuCode || "");
  const [rate, setRate] = useState(sku ? String(sku.rate) : "");
  const [mrp, setMrp] = useState(sku ? String(sku.mrp) : "");
  const [photoUrl, setPhotoUrl] = useState(sku?.photoUrl || "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Saving is disabled to protect live data.");
      return;
    }

    if (!productName.trim() || !category.trim() || !skuSize.trim()) {
      setMessage("Product name, brand, and SKU size are required.");
      return;
    }

    if (!window.confirm(sku ? "Update this product SKU?" : "Save this product SKU?")) {
      return;
    }

    setIsSaving(true);
    try {
      const nextSku = {
        id: sku?.id || crypto.randomUUID(),
        productId: sku?.productId || crypto.randomUUID(),
        productName: productName.trim(),
        category: category.trim(),
        skuSize: skuSize.trim(),
        skuCode: skuCode.trim() || null,
        rate: toNumber(rate),
        mrp: toNumber(mrp),
        photoUrl: photoUrl.trim() || null,
      };

      if (useSupabase) {
        const supabase = createSupabaseBrowserClient();
        const productPayload = {
          name: nextSku.productName,
          category: nextSku.category,
          photo_url: nextSku.photoUrl,
          active: true,
        };

        if (sku) {
          const { data: productData, error: productError } = await supabase
            .from("products")
            .update(productPayload)
            .eq("id", sku.productId)
            .select("id")
            .maybeSingle();

          if (productError) {
            setMessage(productError.message);
            return;
          }

          if (!productData) {
            setMessage("Product was not updated. Check admin permission and refresh the page.");
            return;
          }

          const { data: skuData, error: skuError } = await supabase
            .from("product_skus")
            .update({
              sku_size: nextSku.skuSize,
              sku_code: nextSku.skuCode,
              rate: nextSku.rate,
              mrp: nextSku.mrp,
              active: true,
            })
            .eq("id", sku.id)
            .select("id")
            .maybeSingle();

          if (skuError) {
            setMessage(skuError.message);
            return;
          }

          if (!skuData) {
            setMessage("SKU was not updated. Check admin permission and refresh the page.");
            return;
          }
        } else {
          const { data: productData, error: productError } = await supabase
            .from("products")
            .insert(productPayload)
            .select("id")
            .single();

          if (productError || !productData) {
            setMessage(productError?.message || "Product was not created.");
            return;
          }

          const { error: skuError } = await supabase.from("product_skus").insert({
            product_id: productData.id,
            sku_size: nextSku.skuSize,
            sku_code: nextSku.skuCode,
            rate: nextSku.rate,
            mrp: nextSku.mrp,
            active: true,
          });

          if (skuError) {
            await supabase.from("products").delete().eq("id", productData.id);
            setMessage(skuError.message);
            return;
          }
        }
      } else {
        upsertLocalProductSku(nextSku);
      }

      onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-4">
      <section className="mx-auto w-full max-w-5xl rounded-lg bg-white p-4 shadow-xl" aria-labelledby="product-editor-title">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 id="product-editor-title" className="text-xl font-bold text-slate-900">{sku ? "Edit Product" : "Add Product"}</h2>
            {sku ? <p className="text-sm text-slate-600">{sku.productName}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Product name</span>
            <input type="text" value={productName} onChange={(event) => setProductName(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Brand</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
              <option value="MANISH">MANISH</option>
              <option value="SPICELEAF">SPICELEAF</option>
              {category !== "MANISH" && category !== "SPICELEAF" ? <option value={category}>{category}</option> : null}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Product image URL</span>
            <input type="url" value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
          </label>

          <div>
            <p className="text-sm font-semibold text-slate-800">SKU details</p>
            <div className="mt-2 grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">SKU size</span>
                <input type="text" value={skuSize} onChange={(event) => setSkuSize(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">SKU code</span>
                <input type="text" value={skuCode} onChange={(event) => setSkuCode(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Rate</span>
                <input type="number" min="0" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">MRP</span>
                <input type="number" min="0" inputMode="decimal" value={mrp} onChange={(event) => setMrp(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
              </label>
            </div>
          </div>
        </div>

        {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
        {!persistenceEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Preview mode is active. You can test this form, but saving is disabled to protect live data.</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!persistenceEnabled || isSaving} onClick={() => void handleSave()} className="rounded-md bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isSaving ? "Saving" : "Save Product"}</button>
        </div>
      </section>
    </div>
  );
}

export function AdminProducts({ role, initialProductSkus, writesEnabled = true, mutationUiEnabled = writesEnabled }: AdminProductsProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [editingSku, setEditingSku] = useState<LocalProductSku | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const productSkus = initialProductSkus || readLocalProductSkus();
  const canShowMutations = role === "admin";
  const canMutate = role === "admin" && writesEnabled;
  const canOpenMutationUi = role === "admin" && mutationUiEnabled;
  const useSupabase = initialProductSkus !== undefined;
  const visibleSkus = useMemo(
    () => sortProductSkusForDisplay(productSkus.filter((sku) => matchesSearch(sku, searchValue))),
    [productSkus, searchValue],
  );

  function handleSaved() {
    setRefreshKey((value) => value + 1);
    if (useSupabase) {
      router.refresh();
    }
  }

  async function handleDelete(skuId: string) {
    if (!window.confirm("Delete this SKU permanently? Existing order history may block this delete.")) {
      return;
    }

    if (useSupabase) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("product_skus").delete().eq("id", skuId);

      if (error) {
        window.alert(`SKU could not be deleted: ${error.message}`);
        return;
      }
    } else {
      deleteLocalProductSku(skuId);
    }

    handleSaved();
  }

  void refreshKey;

  return (
    <section id="products" className="space-y-4 scroll-mt-32" aria-labelledby="admin-products-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="admin-products-title" className="text-2xl font-bold text-stone-900">Products</h2>
            <p className="mt-1 text-sm text-stone-600">{visibleSkus.length} products</p>
          </div>
          {canShowMutations ? (
            <button type="button" disabled={!canOpenMutationUi} onClick={() => setIsAdding(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Add Product
            </button>
          ) : null}
        </div>

        <label className="mt-5 block rounded-lg border border-stone-200 bg-stone-50 p-4">
          <div className="text-sm font-semibold text-stone-700">Search products</div>
          <input type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} className="mt-2 w-full max-w-xl rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100" placeholder="Name, SKU code, size, brand" />
        </label>
      </div>

      {visibleSkus.length ? (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-2 shadow-sm">
          {visibleSkus.map((sku) => (
            <article key={sku.id} className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/40 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <ProductImage sku={sku} />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-stone-900">{sku.productName}</h3>
                  <p className="text-sm font-semibold text-stone-600">{formatBrand(sku.category)}</p>
                  <p className="mt-1 text-sm text-stone-700"><span className="font-semibold">SKU size:</span> {sku.skuSize}</p>
                </div>
              </div>
              {canShowMutations ? (
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={!canOpenMutationUi} onClick={() => setEditingSku(sku)} className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500">
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </button>
                  <button type="button" disabled={!canMutate} onClick={() => void handleDelete(sku.id)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Package className="mx-auto h-8 w-8 text-stone-400" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-stone-900">No products match this search</h3>
          <p className="mt-2 text-sm text-stone-600">Change the search text to view other products.</p>
        </div>
      )}

      {isAdding ? <ProductEditor persistenceEnabled={canMutate} useSupabase={useSupabase} onClose={() => setIsAdding(false)} onSaved={handleSaved} /> : null}
      {editingSku ? <ProductEditor sku={editingSku} persistenceEnabled={canMutate} useSupabase={useSupabase} onClose={() => setEditingSku(null)} onSaved={handleSaved} /> : null}
    </section>
  );
}
