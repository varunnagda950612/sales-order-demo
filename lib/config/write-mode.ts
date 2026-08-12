export function areSupabaseWritesEnabled() {
  return process.env.NEXT_PUBLIC_SUPABASE_WRITE_MODE === "enabled";
}

export function isMutationPreviewEnabled() {
  return process.env.NEXT_PUBLIC_MUTATION_PREVIEW_MODE === "enabled";
}
