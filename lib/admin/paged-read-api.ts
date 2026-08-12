import type {
  LocalCollection,
  LocalOrder,
  PaymentMode,
  SalesRouteShop,
} from "@/types/domain";

type BasePagedReadParams = {
  salesPersonId?: string;
  area?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  cursor?: string | null;
  limit?: number;
  includeSummary?: boolean;
};

export type OrdersPageResponse = {
  orders: LocalOrder[];
  shops: SalesRouteShop[];
  summary: {
    total: number;
    updated: number;
    adhoc: number;
  } | null;
  nextCursor: string | null;
};

export type CollectionsPageResponse = {
  collections: LocalCollection[];
  shops: SalesRouteShop[];
  summary: {
    rowCount: number;
    cash: number;
    cheque: number;
    upi: number;
    total: number;
  } | null;
  nextCursor: string | null;
};

export type CollectionsPageParams = BasePagedReadParams & {
  paymentMode?: PaymentMode;
};

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    return;
  }

  params.set(key, String(value));
}

async function readJson<TResponse>(url: string) {
  const response = await fetch(url);
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Unable to load data.";

    throw new Error(message);
  }

  return body as TResponse;
}

export async function readOrdersPage(params: BasePagedReadParams) {
  const query = new URLSearchParams();
  appendOptionalParam(query, "salesPersonId", params.salesPersonId);
  appendOptionalParam(query, "area", params.area);
  appendOptionalParam(query, "createdAtFrom", params.createdAtFrom);
  appendOptionalParam(query, "createdAtTo", params.createdAtTo);
  appendOptionalParam(query, "updatedAtFrom", params.updatedAtFrom);
  appendOptionalParam(query, "updatedAtTo", params.updatedAtTo);
  appendOptionalParam(query, "cursor", params.cursor);
  appendOptionalParam(query, "limit", params.limit);
  appendOptionalParam(query, "summary", params.includeSummary ?? true);

  return readJson<OrdersPageResponse>(`/api/orders?${query.toString()}`);
}

export async function readCollectionsPage(params: CollectionsPageParams) {
  const query = new URLSearchParams();
  appendOptionalParam(query, "salesPersonId", params.salesPersonId);
  appendOptionalParam(query, "area", params.area);
  appendOptionalParam(query, "paymentMode", params.paymentMode);
  appendOptionalParam(query, "createdAtFrom", params.createdAtFrom);
  appendOptionalParam(query, "createdAtTo", params.createdAtTo);
  appendOptionalParam(query, "updatedAtFrom", params.updatedAtFrom);
  appendOptionalParam(query, "updatedAtTo", params.updatedAtTo);
  appendOptionalParam(query, "cursor", params.cursor);
  appendOptionalParam(query, "limit", params.limit);
  appendOptionalParam(query, "summary", params.includeSummary ?? true);

  return readJson<CollectionsPageResponse>(`/api/collections?${query.toString()}`);
}
