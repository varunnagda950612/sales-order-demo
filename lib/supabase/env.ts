import { z } from "zod";
import { assertDemoSupabaseTarget } from "@/lib/demo/project-guard";

const clientEnvSchema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
});

export function getSupabaseBrowserEnv() {
  const result = clientEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (result.success) {
    assertDemoSupabaseTarget(result.data.supabaseUrl);
  }

  return result;
}

export function getSupabaseServerEnv() {
  const result = clientEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    supabaseAnonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  });

  if (result.success) {
    assertDemoSupabaseTarget(result.data.supabaseUrl);
  }

  return result;
}
