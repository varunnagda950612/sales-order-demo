import { NextResponse } from "next/server";
import { getAppVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const response = NextResponse.json({
    version: getAppVersion(),
    checkedAt: new Date().toISOString(),
  });

  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  );

  return response;
}
