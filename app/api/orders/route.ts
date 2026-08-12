import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import {
  readSupabaseOrderListWithShops,
  readSupabaseOrderSummary,
} from "@/lib/repositories/supabase-read";
import {
  getNextOffsetCursor,
  getPageSize,
  readOffsetCursor,
} from "@/lib/repositories/read-pagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getOptionalParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key)?.trim() || undefined;
}

async function requireReadAccess() {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile || !profile.active) {
    throw new Error("Login is required.");
  }

  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "sales") {
    throw new Error("Admin, manager, or sales access is required.");
  }

  return { supabase, profile };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireReadAccess();
    const searchParams = request.nextUrl.searchParams;
    const pageSize = getPageSize(searchParams.get("limit"), 100);
    const currentOffset = readOffsetCursor(searchParams.get("cursor"));
    const includeSummary = searchParams.get("summary") !== "false";
    const options = {
      salesPersonId:
        profile.role === "sales" ? profile.id : getOptionalParam(request, "salesPersonId"),
      area: getOptionalParam(request, "area"),
      createdAtFrom: getOptionalParam(request, "createdAtFrom"),
      createdAtTo: getOptionalParam(request, "createdAtTo"),
      updatedAtFrom: getOptionalParam(request, "updatedAtFrom"),
      updatedAtTo: getOptionalParam(request, "updatedAtTo"),
      ascending: true,
    };

    const [ordersRead, summary] = await Promise.all([
      readSupabaseOrderListWithShops(supabase, {
        ...options,
        offset: currentOffset,
        limit: pageSize + 1,
      }),
      includeSummary ? readSupabaseOrderSummary(supabase, options) : Promise.resolve(null),
    ]);
    const pageOrders = ordersRead.orders.slice(0, pageSize);
    const pageShopIds = new Set(pageOrders.map((order) => order.shopId));
    const pageShops = ordersRead.shops.filter((shop) => pageShopIds.has(shop.id));

    return NextResponse.json(
      {
        orders: pageOrders,
        shops: pageShops,
        summary,
        nextCursor: getNextOffsetCursor({
          currentOffset,
          fetchedCount: ordersRead.orders.length,
          pageSize,
        }),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
          "X-MM-Records": String(pageOrders.length),
          "X-MM-Has-More":
            ordersRead.orders.length > pageOrders.length ? "1" : "0",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load orders.";
    const status = message.includes("access") || message.includes("Login") ? 403 : 500;
    return jsonError(message, status);
  }
}
