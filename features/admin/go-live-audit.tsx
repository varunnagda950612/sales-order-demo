"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { getGoLiveAuditChecks, goLiveTableMappings } from "@/lib/go-live/audit";

function getStatusClass(status: "pass" | "warn" | "blocked") {
  if (status === "pass") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function StatusIcon({ status }: { status: "pass" | "warn" | "blocked" }) {
  if (status === "pass") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />;
  }

  if (status === "warn") {
    return <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />;
  }

  return <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden="true" />;
}

export function AdminGoLiveAudit() {
  const checks = getGoLiveAuditChecks();
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const warningCount = checks.filter((check) => check.status === "warn").length;

  return (
    <section className="space-y-4" aria-labelledby="go-live-audit-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">Production readiness</p>
            <h2 id="go-live-audit-title" className="mt-1 text-2xl font-bold text-stone-900">
              Go-Live Audit
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Read-only diagnostics for environment state, adapter readiness, and live-write blockers.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-orange-700">Warnings</p>
              <p className="mt-1 text-xl font-bold text-orange-800">{warningCount}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-red-700">Blocked</p>
              <p className="mt-1 text-xl font-bold text-red-800">{blockedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {checks.map((check) => (
          <article key={check.label} className={`rounded-lg border p-4 ${getStatusClass(check.status)}`}>
            <div className="flex items-start gap-3">
              <StatusIcon status={check.status} />
              <div>
                <h3 className="font-bold">{check.label}</h3>
                <p className="mt-1 text-sm leading-6">{check.detail}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-stone-900">Required table mappings</h3>
        <ul className="mt-3 grid gap-2 text-sm text-stone-700 lg:grid-cols-2">
          {goLiveTableMappings.map((mapping) => (
            <li key={mapping} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              {mapping}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
