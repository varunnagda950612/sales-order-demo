"use client";

import { KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import {
  getLocalDemoUser,
  localSessionCookieName,
  serializeLocalProfile,
} from "@/lib/auth/local-session";
import { getDashboardPath } from "@/lib/auth/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole } from "@/types/domain";

const loginEmailDomain = "sales-order-demo.invalid";

function toLoginEmail(loginId: string) {
  return `${loginId.trim().toLowerCase()}@${loginEmailDomain}`;
}

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "manager" || value === "sales";
}

type LoginFormProps = {
  localMode: boolean;
};

export function LoginForm({ localMode }: LoginFormProps) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);

    if (currentUrl.searchParams.has("password") || currentUrl.searchParams.has("loginId")) {
      window.history.replaceState(null, "", currentUrl.pathname);
    }
  }, []);

  async function handleLogin() {
    if (isSubmitting) {
      return;
    }

    setMessage(null);
    setIsSubmitting(true);

    try {
      if (localMode) {
        const profile = getLocalDemoUser(loginId);

        if (!profile) {
          setMessage("Use admin, manager, or sales in local mode.");
          return;
        }

        document.cookie = `${localSessionCookieName}=${serializeLocalProfile(profile)}; path=/; max-age=2592000; samesite=lax`;
        window.localStorage.setItem("manish-masala-next.local-profile.v1", JSON.stringify(profile));
        router.replace(getDashboardPath(profile.role));
        router.refresh();
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: toLoginEmail(loginId),
        password,
      });

      if (error || !authData.user) {
        setMessage(error?.message || "Login failed.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", authData.user.id)
        .maybeSingle<{ role: string | null; active: boolean | null }>();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setMessage("Login succeeded, but no active app profile was found.");
        return;
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        setMessage("This user is inactive. Contact the admin.");
        return;
      }

      if (!isAppRole(profile.role)) {
        await supabase.auth.signOut();
        setMessage("This user has an invalid app role. Contact the admin.");
        return;
      }

      router.replace(getDashboardPath(profile.role));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEnterKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handleLogin();
  }

  return (
    <div className="space-y-5" role="form" aria-label="Login form">
      <div>
        <label htmlFor="login-id" className="text-sm font-semibold text-stone-700">
          User ID
        </label>
        <input
          id="login-id"
          type="text"
          autoComplete="username"
          suppressHydrationWarning
          required
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          onKeyDown={handleEnterKey}
          className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2.5 text-base text-stone-900 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100"
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-semibold text-stone-700">
          Password
        </label>
        <div className="mt-2 flex rounded-lg border border-stone-300 bg-stone-50 transition-colors focus-within:border-orange-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-orange-100">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            suppressHydrationWarning
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={handleEnterKey}
            className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-base text-stone-900 focus:outline-none"
          />
          <button
            type="button"
            suppressHydrationWarning
            className="inline-flex w-11 items-center justify-center text-stone-500 transition-colors hover:text-orange-700"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800" role="alert">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        suppressHydrationWarning
        disabled={isSubmitting}
        onClick={() => void handleLogin()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
      >
        <LogIn className="h-5 w-5" aria-hidden="true" />
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </div>
  );
}
