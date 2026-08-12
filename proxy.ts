import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUserWithRetry } from "@/lib/supabase/auth-retry";
import { getSupabaseServerEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  const requestHost = request.headers.get("host") ?? "";

  if (
    process.env.NODE_ENV === "development" &&
    (request.nextUrl.hostname === "127.0.0.1" || requestHost.startsWith("127.0.0.1"))
  ) {
    const localUrl = request.nextUrl.clone();
    localUrl.hostname = "localhost";
    return NextResponse.redirect(localUrl);
  }

  if (
    request.nextUrl.pathname === "/login" &&
    (request.nextUrl.searchParams.has("password") ||
      request.nextUrl.searchParams.has("loginId"))
  ) {
    const cleanLoginUrl = request.nextUrl.clone();
    cleanLoginUrl.search = "";
    return NextResponse.redirect(cleanLoginUrl);
  }

  let response = NextResponse.next({
    request,
  });

  const env = getSupabaseServerEnv();

  if (!env.success) {
    return response;
  }

  const supabase = createServerClient(env.data.supabaseUrl, env.data.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    await getSupabaseUserWithRetry(supabase);
  } catch {
    // A temporary auth outage must not make public routes such as login unavailable.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|samples|.*\\..*).*)"],
};
