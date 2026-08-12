"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { localSessionCookieName } from "@/lib/auth/local-session";
import { isLocalAppMode } from "@/lib/config/app-mode";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getCoreSyncSummary, hydrateCoreOutboxFromBackup } from "@/lib/sync/core-outbox";

type SignOutButtonProps = {
  compact?: boolean;
  variant?: "default" | "dark";
};

export function SignOutButton({
  compact = false,
  variant = "default",
}: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    if (isLocalAppMode()) {
      document.cookie = `${localSessionCookieName}=; path=/; max-age=0; samesite=lax`;
      window.localStorage.removeItem("manish-masala-next.local-profile.v1");
      router.replace("/login");
      router.refresh();
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let protectedCount = 0;

    try {
      await hydrateCoreOutboxFromBackup();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const summary = getCoreSyncSummary(user?.id);
      protectedCount = summary.pending + summary.syncing + summary.failed;
    } catch {
      const summary = getCoreSyncSummary();
      protectedCount = summary.pending + summary.syncing + summary.failed;
    }

    if (
      protectedCount &&
      !window.confirm(
        `${protectedCount} core record${protectedCount === 1 ? " is" : "s are"} still protected on this device. They will not be deleted, but only this account can sync them after you sign in again. Sign out anyway?`,
      )
    ) {
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      window.alert(`Unable to sign out safely: ${error.message}`);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
        compact
          ? "h-10 w-10 p-0"
          : "px-3 py-2"
      } ${
        variant === "dark"
          ? "border-stone-700 bg-stone-800 text-stone-100 hover:border-orange-400 hover:bg-stone-700"
          : "border-stone-300 bg-white text-stone-700 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
      }`}
      aria-label={compact ? "Sign out" : undefined}
      title={compact ? "Sign out" : undefined}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className={compact ? "sr-only" : undefined}>Sign out</span>
    </button>
  );
}
