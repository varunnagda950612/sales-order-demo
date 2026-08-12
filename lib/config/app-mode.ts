export function isLocalAppMode() {
  return process.env.NEXT_PUBLIC_APP_DATA_MODE === "local";
}

export function isSupabaseAppMode() {
  return !isLocalAppMode();
}
