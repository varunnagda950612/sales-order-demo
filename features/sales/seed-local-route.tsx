"use client";

import { FormEvent, useState } from "react";
import { Database, Download } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { seedLocalProductSkus } from "@/lib/local/products";
import { seedLocalShops } from "@/lib/local/shops";
import { seedLocalSalesTargets } from "@/lib/local/targets";
import { writeSalesRouteSnapshot } from "@/lib/local/sales-route-snapshot";
import { getSalesRouteData } from "@/services/sales-shops";

type SeedLocalRouteProps = {
  localSalesPersonId: string;
  onSeeded: () => void;
};

const loginEmailDomain = "manishmasala.local";

function toLoginEmail(loginId: string) {
  return `${loginId.trim().toLowerCase()}@${loginEmailDomain}`;
}

export function SeedLocalRoute({ localSalesPersonId, onSeeded }: SeedLocalRouteProps) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  async function handleSeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSeeding(true);

    const supabase = createSupabaseBrowserClient();

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: toLoginEmail(loginId),
        password,
      });

      if (authError || !authData.user) {
        setMessage(authError?.message || "Supabase login failed.");
        return;
      }

      const routeData = await getSalesRouteData(supabase, authData.user.id);
      const productSkus = await seedLocalProductSkus(supabase);
      const shops = await seedLocalShops(supabase, {
        fromSalesPersonId: authData.user.id,
        toSalesPersonId: localSalesPersonId,
      });
      const targets = await seedLocalSalesTargets(supabase, authData.user.id, localSalesPersonId);
      writeSalesRouteSnapshot(localSalesPersonId, routeData);
      await supabase.auth.signOut();
      setMessage(
        `Seeded ${routeData.shops.length} route shops, ${shops.length} total shops, ${productSkus.length} SKUs, and ${targets.length} targets into localStorage.`,
      );
      onSeeded();
    } catch (error) {
      await supabase.auth.signOut();
      setMessage(error instanceof Error ? error.message : "Seed failed.");
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-orange-100 p-2 text-orange-700">
          <Database className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-bold text-stone-900">Seed Local Route</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Read one salesperson route from Supabase and copy it into this browser&apos;s localStorage.
            It also seeds all shops for Adhoc Order, active products/SKUs for order entry, and sales targets.
          </p>
        </div>
      </div>

      <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]" onSubmit={handleSeed}>
        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Supabase login ID</span>
          <input
            type="text"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100"
            required
          />
        </label>

        <button
          type="submit"
          disabled={isSeeding}
          className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-orange-600 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          <Download className="h-5 w-5" aria-hidden="true" />
          {isSeeding ? "Seeding" : "Seed"}
        </button>
      </form>

      {message ? (
        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
