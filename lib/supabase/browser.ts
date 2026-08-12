"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "./env";

function createConfiguredBrowserClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

let browserClient: ReturnType<typeof createConfiguredBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const env = getSupabaseBrowserEnv();

  if (!env.success) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  browserClient = createConfiguredBrowserClient(env.data.supabaseUrl, env.data.supabaseAnonKey);
  return browserClient;
}
