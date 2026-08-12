import type { LocalOrderItem, LocalProductSku } from "@/types/domain";

const productNameDisplayOrder = [
  "HALDI PWD 50G",
  "HALDI PWD 100G",
  "HALDI PWD 200G",
  "CHILLY PWD 50G",
  "CHILLY PWD 100G",
  "CHILLY PWD 200G",
  "DHANIA PWD 50G",
  "DHANIA PWD 100G",
  "DHANIA PWD 200G",
  "MALVANI MASALA 100G",
  "MALVANI MASALA 200G",
  "GARAM MASALA 50G",
  "GARAM MASALA 100G",
  "MIX MASALA 100G",
  "AGRI MASALA 100G",
  "DHANIA ZIRA MIX 100G",
  "GODA MASALA 100G",
  "KASHMIRI CHILLY PWD 50G",
  "KASHMIRI CHILLY PWD 100G",
  "ZIRA PWD 50G",
  "ZIRA PWD 100G",
  "AMCHUR PWD 50G",
  "SUNTH PWD 50G",
  "MIRI PWD 25G",
  "JESTHIMADH PWD 50G",
  "HALDI PWD 500G",
  "CHILLY PWD 500G",
  "CHILLY PWD DABBI 500G",
  "DHANIA PWD 500G",
  "KASHMIRI CHILLY PWD 500G",
  "GARAM MASALA 500G",
  "MALVANI MASALA 500G",
  "MIX MASALA 500G",
  "AGRI MASALA 500G",
  "DHANIA ZIRA MIX 500G",
  "GODA MASALA 500G",
  "ZIRA PWD 500G",
  "AMCHUR PWD 500G",
  "SUNTH PWD 500G",
  "MIRI PWD 500G",
  "ACHAR SAMBHAR 500G",
  "AS KASHMIRI 500G",
  "GARAM MASALA A1 500G",
  "MALVANI MASALA A1 1KG",
  "MIX MASALA SARAS 1KG",
  "UP MASALA 500G",
  "HALDI PWD RS.10",
  "HALDI PWD RS.5",
  "CHILLY PWD RS.10",
  "CHILLY PWD RS.5",
  "DHANIA PWD RS.10",
  "DHANIA PWD RS.5",
  "GARAM MASALA RS.10",
  "SL CHILLY PWD 1KG",
  "SL CLASSIC RED CHILLY PWD 1KG",
  "SL TURMERIC PWD 1KG",
  "SL CORAINDER PWD 1KG",
  "SL GARAM MASALA 1KG",
  "SL MIX MALVANI MASALA 1KG",
  "SL KASHMIRI CHILLI PWD 1KG",
  "SL CHILLY PWD A1 1KG",
  "SL ACHAR SAMBHAR 1KG",
  "SL CHAT MASALA 1KG",
  "SL CUMIN PWD 1KG",
  "SL BLACK PEPPER PWD 1KG",
  "SL DRY MANGO PWD 1KG",
  "SL CAROM SEEDS 1KG",
  "SL BEDGI CHILLY PWD 1KG",
  "SL BLACK PEPPER PWD 1KG",
  "SL BLACK MUSTARD SEEDS 1KG",
  "SL CUMIN SEEDS 1 KG",
  "SL KASURI METHI 200G",
  "SL KASURI METHI 1KG",
  "SL FENUGREEK SEEDS 1KG",
  "SL ROASTED FENNEL SEEDS 1KG",
  "SL SESAME SEEDS 1KG",
  "SL FENNEL SEEDS 1KG",
];

function normalizeProductName(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

const productRankByName = new Map(
  productNameDisplayOrder.map((name, index) => [normalizeProductName(name), index]),
);

type ProductDisplayItem = Pick<LocalProductSku | LocalOrderItem, "productName" | "skuSize">;

function compareProductsByDisplayOrder(a: ProductDisplayItem, b: ProductDisplayItem) {
  const rankDifference =
    (productRankByName.get(normalizeProductName(a.productName)) ?? Number.MAX_SAFE_INTEGER) -
    (productRankByName.get(normalizeProductName(b.productName)) ?? Number.MAX_SAFE_INTEGER);

  if (rankDifference) {
    return rankDifference;
  }

  return (
    a.productName.localeCompare(b.productName, undefined, { numeric: true, sensitivity: "base" }) ||
    a.skuSize.localeCompare(b.skuSize, undefined, { numeric: true, sensitivity: "base" })
  );
}

export function compareProductSkusForDisplay(a: LocalProductSku, b: LocalProductSku) {
  return compareProductsByDisplayOrder(a, b);
}

export function sortProductSkusForDisplay(productSkus: LocalProductSku[]) {
  return [...productSkus].sort(compareProductSkusForDisplay);
}

export function sortOrderItemsForProductDisplay(orderItems: LocalOrderItem[]) {
  return [...orderItems].sort(compareProductsByDisplayOrder);
}
