const projectRefPattern = /^[a-z0-9]{20}$/;

function getProjectRef(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname.toLowerCase();
  const suffix = ".supabase.co";

  if (!hostname.endsWith(suffix)) {
    throw new Error("Demo safety check failed: Supabase URL must use a supabase.co project host.");
  }

  return hostname.slice(0, -suffix.length);
}

export function assertDemoSupabaseTarget(supabaseUrl: string) {
  if (process.env.NEXT_PUBLIC_APP_DATA_MODE === "local") {
    return;
  }

  if (process.env.NEXT_PUBLIC_APP_VARIANT !== "demo") {
    throw new Error("Demo safety check failed: NEXT_PUBLIC_APP_VARIANT must be demo.");
  }

  const expectedProjectRef = process.env.NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF?.trim();

  if (!expectedProjectRef || !projectRefPattern.test(expectedProjectRef)) {
    throw new Error(
      "Demo safety check failed: NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF must be the 20-character demo project ref.",
    );
  }

  const actualProjectRef = getProjectRef(supabaseUrl);

  if (actualProjectRef !== expectedProjectRef) {
    throw new Error(
      `Demo safety check failed: configured Supabase project ${actualProjectRef} does not match ${expectedProjectRef}.`,
    );
  }
}
