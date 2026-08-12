import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getDashboardPath, loginPath } from "@/lib/auth/routing";
import { isLocalAppMode } from "@/lib/config/app-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};

  if ("password" in params || "loginId" in params) {
    redirect(loginPath);
  }

  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  const localMode = isLocalAppMode();

  if (profile?.active) {
    redirect(getDashboardPath(profile.role));
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-yellow-100 via-orange-50 to-stone-100 p-4 sm:p-6">
      <section className="w-full max-w-md overflow-hidden rounded-lg border border-white/80 bg-white/95 shadow-xl shadow-stone-900/15">
        <div className="h-1.5 bg-gradient-to-r from-orange-500 via-yellow-300 to-orange-500" />

        <div className="p-6 sm:p-7">
          <Image
            src="/icons/manish-logo-app.png"
            alt="Manish Masala Sales Order Demo"
            width={1422}
            height={951}
            priority
            className="mx-auto h-auto! w-64! max-w-full object-contain sm:w-72!"
          />

          <div className="mt-5 text-left">
            <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
              DEMO ENVIRONMENT
            </span>
            <h1 className="mt-5 text-3xl font-bold text-stone-900">Manish Masala Sales Order</h1>
            <p className="mt-1 text-base text-stone-600">
              Sales, orders, collections, and route management demo
            </p>
          </div>

          {localMode ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">Local mode</p>
              <p className="mt-1">Use admin, manager, or sales. Any password is accepted.</p>
            </div>
          ) : null}

          <div className="mt-7">
            <LoginForm localMode={localMode} />
          </div>

          <p className="mt-6 text-sm text-stone-500">Use your Supabase login ID and password.</p>
        </div>
      </section>
    </main>
  );
}
