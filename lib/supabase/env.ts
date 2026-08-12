import { z } from "zod";

const clientEnvSchema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
});

export function getSupabaseBrowserEnv() {
  return clientEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getSupabaseServerEnv() {
  return clientEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    supabaseAnonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  });
}
