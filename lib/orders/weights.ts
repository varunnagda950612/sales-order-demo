export function getSkuGrams(skuSize: string) {
  const value = skuSize.toLowerCase().trim();
  const kgMatch = value.match(/(\d+(?:\.\d+)?)\s*kg/);
  const gramMatch = value.match(/(\d+(?:\.\d+)?)\s*g/);

  if (kgMatch) {
    return Number(kgMatch[1]) * 1000;
  }

  if (gramMatch) {
    return Number(gramMatch[1]);
  }

  return 0;
}

export function getKgLabel(skuSize: string, quantity: number) {
  const grams = getSkuGrams(skuSize);

  if (!grams || !quantity) {
    return null;
  }

  const kg = (grams * quantity) / 1000;
  return `${kg.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} kg`;
}

export function getTotalKgLabel(items: { skuSize: string; quantity: number }[]) {
  const totalKg = items.reduce(
    (total, item) => total + (getSkuGrams(item.skuSize) * item.quantity) / 1000,
    0,
  );

  return `${totalKg.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} kg`;
}
