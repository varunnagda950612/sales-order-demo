import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServerEnv } from "./env";

export async function createSupabaseServerClient() {
  const env = getSupabaseServerEnv();

  if (!env.success) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.data.supabaseUrl, env.data.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components cannot always set cookies. Middleware can refresh sessions later.
        }
      },
    },
  });
}
