import { AlertTriangle, CheckCircle2, RefreshCw, Smartphone } from "lucide-react";
import { SyncHealthDeleteButton } from "./sync-health-delete-button";
import { SyncRecoveryDownload } from "./sync-recovery-download";
import { SyncRecoveryReplayButton } from "./sync-recovery-replay-button";
import type { SyncHealthDevice, SyncHealthReadResult } from "@/lib/repositories/sync-health";

type AdminSyncHealthProps = {
  result: SyncHealthReadResult;
  canDeleteRows?: boolean;
};

const staleAfterMinutes = 30;

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(value))
    .replace(/\//g, "-");
}

function isStale(row: SyncHealthDevice) {
  return Date.now() - new Date(row.lastSeenAt).getTime() > staleAfterMinutes * 60 * 1000;
}

function getStatusClass(row: SyncHealthDevice) {
  if (row.failedCount > 0 || row.status === "failed") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (row.pendingCount > 0 || row.syncingCount > 0 || row.status === "pending" || row.status === "syncing") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (isStale(row)) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function getStatusLabel(row: SyncHealthDevice) {
  if (row.failedCount > 0 || row.status === "failed") {
    return "Failed";
  }

  if (row.syncingCount > 0 || row.status === "syncing") {
    return "Syncing";
  }

  if (row.pendingCount > 0 || row.status === "pending") {
    return "Pending";
  }

  return isStale(row) ? "No recent heartbeat" : "Clean";
}

function getDeviceLabel(deviceId: string) {
  return deviceId.length > 12 ? `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}` : deviceId;
}

function getSnapshotPendingCount(row: SyncHealthDevice) {
  return row.recoveryPendingCount + row.recoveryFailedCount;
}

function hasRecoverySnapshot(row: SyncHealthDevice) {
  return Boolean(row.recoverySnapshot && getSnapshotPendingCount(row) > 0);
}

function getPendingSnapshotArrays(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") {
    return { orders: [], collections: [], visitProofs: [] };
  }

  const pending = (snapshot as { pending?: unknown }).pending;

  if (!pending || typeof pending !== "object") {
    return { orders: [], collections: [], visitProofs: [] };
  }

  const data = pending as {
    orders?: unknown;
    collections?: unknown;
    visitProofs?: unknown;
  };

  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    collections: Array.isArray(data.collections) ? data.collections : [],
    visitProofs: Array.isArray(data.visitProofs) ? data.visitProofs : [],
  };
}

function getOrderTitle(order: unknown) {
  if (!order || typeof order !== "object") {
    return "Order";
  }

  const data = order as { id?: string; shopId?: string; orderType?: string; status?: string };
  return `${data.orderType || "order"} ${data.status || ""} - ${data.shopId || data.id || ""}`.trim();
}

function getCollectionTitle(collection: unknown) {
  if (!collection || typeof collection !== "object") {
    return "Collection";
  }

  const data = collection as { id?: string; shopId?: string; collectionType?: string; status?: string };
  return `${data.collectionType || "collection"} ${data.status || ""} - ${data.shopId || data.id || ""}`.trim();
}

function getVisitTitle(visit: unknown) {
  if (!visit || typeof visit !== "object") {
    return "Visit proof";
  }

  const data = visit as { shopId?: string; visitType?: string; capturedAt?: string };
  return `${data.visitType || "visit"} - ${data.shopId || ""} ${data.capturedAt ? formatDateTime(data.capturedAt) : ""}`.trim();
}

export function AdminSyncHealth({ result, canDeleteRows = false }: AdminSyncHealthProps) {
  const rows = result.rows;
  const failedCount = rows.filter((row) => row.failedCount > 0 || row.status === "failed").length;
  const pendingCount = rows.filter((row) => row.pendingCount > 0 || row.status === "pending").length;
  const staleCount = rows.filter(isStale).length;
  const recoveryRows = rows.filter(hasRecoverySnapshot);

  return (
    <section className="space-y-4" aria-labelledby="sync-health-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">Device sync monitor</p>
            <h2 id="sync-health-title" className="mt-1 text-2xl font-bold text-stone-900">
              Sync Health
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              View each mobile device&apos;s protected local queue status and recovery snapshots for unsynced records.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">Devices</p>
              <p className="mt-1 text-xl font-bold text-stone-900">{rows.length}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-amber-700">Pending</p>
              <p className="mt-1 text-xl font-bold text-amber-800">{pendingCount}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-red-700">Failed</p>
              <p className="mt-1 text-xl font-bold text-red-800">{failedCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Stale</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{staleCount}</p>
            </div>
          </div>
        </div>
      </div>

      {result.missingTable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">Sync health table is not installed.</p>
              <p className="mt-1">
                Run <span className="font-mono">supabase/migrations/026_add_sync_device_health.sql</span> in Supabase SQL Editor to enable admin visibility.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!result.missingTable && result.missingRecoveryTable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">Recovery snapshot table is not installed.</p>
              <p className="mt-1">
                Run <span className="font-mono">supabase/migrations/027_add_sync_recovery_snapshots.sql</span> in Supabase SQL Editor to view unsynced payload details.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!result.missingTable && !result.missingRecoveryTable && result.recoveryError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">Recovery snapshot details could not be loaded.</p>
              <p className="mt-1">{result.recoveryError}</p>
            </div>
          </div>
        </div>
      ) : null}

      {!result.missingTable && result.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-sm">
          {result.error}
        </div>
      ) : null}

      {!result.missingTable && !result.error && !rows.length ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Smartphone className="mx-auto h-8 w-8 text-stone-400" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-stone-900">No device heartbeats yet</h3>
          <p className="mt-2 text-sm text-stone-600">
            A salesman must open the app after the SQL is installed before their device appears here.
          </p>
        </div>
      ) : null}

      {rows.length ? (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-100 text-stone-700">
                <tr>
                  <th className="px-3 py-2">Salesperson</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Pending</th>
                  <th className="px-3 py-2 text-right">Syncing</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2">Last seen</th>
                  <th className="px-3 py-2">Last success</th>
                  <th className="px-3 py-2">Recovery</th>
                  <th className="px-3 py-2">Latest error</th>
                  {canDeleteRows ? <th className="px-3 py-2">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-stone-200 align-top transition-colors hover:bg-stone-50">
                    <td className="px-3 py-2">
                      <p className="font-bold text-slate-900">{row.salesPersonName}</p>
                      <p className="text-xs text-slate-500">{row.loginId || row.salesPersonId}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-mono text-xs text-slate-700">{getDeviceLabel(row.deviceId)}</p>
                      {row.pageUrl ? <p className="mt-1 max-w-48 truncate text-xs text-slate-500">{row.pageUrl}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${getStatusClass(row)}`}>
                        {row.failedCount > 0 ? (
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : row.pendingCount || row.syncingCount ? (
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {getStatusLabel(row)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">{row.pendingCount}</td>
                    <td className="px-3 py-2 text-right font-semibold text-sky-700">{row.syncingCount}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-700">{row.failedCount}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(row.lastSeenAt)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(row.lastSuccessAt)}</td>
                    <td className="px-3 py-2">
                      {hasRecoverySnapshot(row) ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-800">
                            {getSnapshotPendingCount(row)} record{getSnapshotPendingCount(row) === 1 ? "" : "s"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(row.recoveryUploadedAt)}
                          </p>
                          <SyncRecoveryDownload
                            fileName={`sync-recovery-${row.loginId || row.salesPersonId}-${row.deviceId}.json`}
                            snapshot={row.recoverySnapshot}
                          />
                          {canDeleteRows ? (
                            <SyncRecoveryReplayButton
                              salesPersonId={row.salesPersonId}
                              deviceId={row.deviceId}
                              salesPersonName={row.salesPersonName}
                              recordCount={getSnapshotPendingCount(row)}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="max-w-64 whitespace-normal text-xs text-red-700">{row.latestError || "-"}</p>
                    </td>
                    {canDeleteRows ? (
                      <td className="px-3 py-2">
                        <SyncHealthDeleteButton
                          row={row}
                          includeRecoveryCleanup={!result.missingRecoveryTable}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {recoveryRows.length ? (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-stone-900">Unsynced Recovery Details</h3>
          {recoveryRows.map((row) => {
            const snapshot = getPendingSnapshotArrays(row.recoverySnapshot);

            return (
              <details key={`${row.id}-recovery`} className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                <summary className="cursor-pointer font-bold">
                  {row.salesPersonName} - {getSnapshotPendingCount(row)} protected record{getSnapshotPendingCount(row) === 1 ? "" : "s"}
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="font-bold text-stone-900">Orders ({snapshot.orders.length})</p>
                    <ul className="mt-2 space-y-2">
                      {snapshot.orders.length ? snapshot.orders.map((order, index) => (
                        <li key={index} className="rounded-md bg-stone-50 p-2">
                          <p className="font-semibold text-stone-900">{getOrderTitle(order)}</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-stone-700">
                            {JSON.stringify(order, null, 2)}
                          </pre>
                        </li>
                      )) : <li className="text-stone-500">No unsynced orders.</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="font-bold text-stone-900">Collections ({snapshot.collections.length})</p>
                    <ul className="mt-2 space-y-2">
                      {snapshot.collections.length ? snapshot.collections.map((collection, index) => (
                        <li key={index} className="rounded-md bg-stone-50 p-2">
                          <p className="font-semibold text-stone-900">{getCollectionTitle(collection)}</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-stone-700">
                            {JSON.stringify(collection, null, 2)}
                          </pre>
                        </li>
                      )) : <li className="text-stone-500">No unsynced collections.</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="font-bold text-stone-900">Visit Proofs ({snapshot.visitProofs.length})</p>
                    <ul className="mt-2 space-y-2">
                      {snapshot.visitProofs.length ? snapshot.visitProofs.map((visit, index) => (
                        <li key={index} className="rounded-md bg-stone-50 p-2">
                          <p className="font-semibold text-stone-900">{getVisitTitle(visit)}</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-stone-700">
                            {JSON.stringify(visit, null, 2)}
                          </pre>
                        </li>
                      )) : <li className="text-stone-500">No unsynced visit proofs.</li>}
                    </ul>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
