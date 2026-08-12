import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import {
  readSupabaseCollectionPageWithShops,
  readSupabaseCollectionSummary,
} from "@/lib/repositories/supabase-read";
import {
  getNextOffsetCursor,
  getPageSize,
  readOffsetCursor,
} from "@/lib/repositories/read-pagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentMode } from "@/types/domain";

export const dynamic = "force-dynamic";

const paymentModes = new Set(["cash", "cheque", "upi"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getOptionalParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key)?.trim() || undefined;
}

function getPaymentMode(request: NextRequest) {
  const paymentMode = getOptionalParam(request, "paymentMode");
  return paymentMode && paymentModes.has(paymentMode)
    ? (paymentMode as PaymentMode)
    : undefined;
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
      paymentMode: getPaymentMode(request),
      createdAtFrom: getOptionalParam(request, "createdAtFrom"),
      createdAtTo: getOptionalParam(request, "createdAtTo"),
      updatedAtFrom: getOptionalParam(request, "updatedAtFrom"),
      updatedAtTo: getOptionalParam(request, "updatedAtTo"),
      ascending: true,
    };

    const [collectionsRead, summary] = await Promise.all([
      readSupabaseCollectionPageWithShops(supabase, {
        ...options,
        offset: currentOffset,
        limit: pageSize,
      }),
      includeSummary ? readSupabaseCollectionSummary(supabase, options) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      {
        collections: collectionsRead.collections,
        shops: collectionsRead.shops,
        summary,
        nextCursor: getNextOffsetCursor({
          currentOffset,
          fetchedCount: collectionsRead.fetchedRowCount,
          pageSize,
        }),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
          "X-MM-Records": String(collectionsRead.rawRowCount),
          "X-MM-Has-More":
            collectionsRead.fetchedRowCount > collectionsRead.rawRowCount ? "1" : "0",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load collections.";
    const status = message.includes("access") || message.includes("Login") ? 403 : 500;
    return jsonError(message, status);
  }
}
