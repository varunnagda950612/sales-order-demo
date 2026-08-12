"use client";

import { useCallback, useMemo, useState } from "react";
import { SalesAdhocOrder } from "./adhoc-order";
import { SalesCollections } from "./collections";
import { SalesDayWorkflow } from "./day-workflow";
import { SalesMyOrders } from "./my-orders";
import { SalesMyShops } from "./my-shops";
import { SalesTargets } from "./targets";
import { CoreSyncStatus } from "@/components/sync/core-sync-status";
import { getIndiaDate } from "@/lib/dates/india";
import { readLocalOrders } from "@/lib/local/orders";
import { readLocalSalesDaySessionForDate } from "@/lib/local/sales-day-sessions";
import { readLocalShops } from "@/lib/local/shops";
import { readLocalSalesTargets } from "@/lib/local/targets";
import { readSalesRouteSnapshot } from "@/lib/local/sales-route-snapshot";
import { canUseRouteWork, getRouteWorkBlockMessage } from "@/lib/sales-day/client";
import { getUnsyncedOrders } from "@/lib/sync/core-outbox";
import {
  getTargetPeriod,
  getTargetProgress,
  type TargetProgress,
} from "@/lib/targets/progress";
import type {
  LocalCollection,
  LocalOrder,
  LocalProductSku,
  LocalSalesTarget,
  SalesDaySession,
  SalesRouteData,
  SalesRouteShop,
} from "@/types/domain";

type SalesLocalDashboardProps = {
  routeData: SalesRouteData;
  salesPersonId: string;
  salesPersonName: string;
  localMode: boolean;
  activeSection: "shops" | "adhoc-order" | "orders" | "collections" | "targets";
  initialDaySession?: SalesDaySession | null;
  geofenceMeters: number | null;
  initialShops?: SalesRouteShop[];
  initialOrders?: LocalOrder[];
  initialCollections?: LocalCollection[];
  initialCollectionRawRowCount?: number;
  initialTargets?: LocalSalesTarget[];
  initialProductSkus?: LocalProductSku[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

function mergeOrdersForTargetProgress(
  initialOrders: LocalOrder[] | undefined,
  localOrders: LocalOrder[],
) {
  const orderById = new Map<string, LocalOrder>();

  (initialOrders || localOrders).forEach((order) => {
    orderById.set(order.id, order);
  });

  getUnsyncedOrders().forEach((order) => {
    orderById.set(order.id, order);
  });

  return Array.from(orderById.values());
}

export function SalesLocalDashboard({
  routeData,
  salesPersonId,
  salesPersonName,
  localMode,
  activeSection,
  initialDaySession,
  geofenceMeters,
  initialShops,
  initialOrders,
  initialCollections,
  initialCollectionRawRowCount,
  initialTargets,
  initialProductSkus,
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: SalesLocalDashboardProps) {
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [visitsRefreshKey, setVisitsRefreshKey] = useState(0);
  const [shopsRefreshKey, setShopsRefreshKey] = useState(0);
  const today = getIndiaDate();
  const [daySession, setDaySession] = useState<SalesDaySession | null>(() =>
    localMode
      ? readLocalSalesDaySessionForDate(salesPersonId, today)
      : initialDaySession || null,
  );
  const allShops = initialShops || readLocalShops(shopsRefreshKey);
  const localRouteData = localMode ? readSalesRouteSnapshot(salesPersonId)?.routeData : null;
  const activeRouteData = localRouteData || routeData;
  const shopsForLookup = allShops.length ? allShops : activeRouteData.shops;
  const activeTargetProgress = useMemo<TargetProgress[]>(() => {
    const targets = (initialTargets || readLocalSalesTargets(ordersRefreshKey))
      .filter((target) => target.salesPersonId === salesPersonId)
      .filter((target) => getTargetPeriod(target, today) === "active")
      .sort(
        (a, b) =>
          a.endDate.localeCompare(b.endDate) ||
          a.productName.localeCompare(b.productName),
      );
    const orders = mergeOrdersForTargetProgress(
      initialOrders,
      initialOrders ? [] : readLocalOrders(ordersRefreshKey),
    ).filter(
      (order) =>
        order.salesPersonId === salesPersonId && order.status !== "cancelled",
    );

    return targets.map((target) => getTargetProgress(target, orders));
  }, [initialOrders, initialTargets, ordersRefreshKey, salesPersonId, today]);
  const handleDaySessionChange = useCallback(
    (session: SalesDaySession | null) => {
      setDaySession(session);
    },
    [],
  );
  const routeWorkAllowed = canUseRouteWork(daySession);
  const routeWorkMessage = getRouteWorkBlockMessage(daySession);

  return (
    <div className="space-y-6">
      <CoreSyncStatus
        actorId={salesPersonId}
        writesEnabled={writesEnabled}
        localMode={localMode}
      />
      <SalesDayWorkflow
        salesPersonId={salesPersonId}
        localMode={localMode}
        writesEnabled={writesEnabled}
        initialSession={daySession}
        onSessionChange={handleDaySessionChange}
      />
      {activeSection === "shops" ? (
        <SalesMyShops
          routeData={activeRouteData}
          allShops={shopsForLookup}
          salesPersonId={salesPersonId}
          salesPersonName={salesPersonName}
          localMode={localMode}
          initialOrders={initialOrders}
          ordersRefreshKey={ordersRefreshKey}
          productSkus={initialProductSkus}
          activeTargetProgress={activeTargetProgress}
          geofenceMeters={geofenceMeters}
          routeWorkAllowed={routeWorkAllowed}
          routeWorkMessage={routeWorkMessage}
          onVisitOutcomeChanged={() => setVisitsRefreshKey((value) => value + 1)}
          onOrderSaved={() => setOrdersRefreshKey((value) => value + 1)}
          onSeeded={() => setShopsRefreshKey((value) => value + 1)}
          onShopAdded={() => setShopsRefreshKey((value) => value + 1)}
          writesEnabled={writesEnabled}
          mutationUiEnabled={mutationUiEnabled}
        />
      ) : null}
      {activeSection === "adhoc-order" ? (
        <SalesAdhocOrder
          salesPersonId={salesPersonId}
          shops={shopsForLookup}
          localMode={localMode}
          productSkus={initialProductSkus}
          activeTargetProgress={activeTargetProgress}
          onOrderSaved={() => setOrdersRefreshKey((value) => value + 1)}
          writesEnabled={writesEnabled}
          mutationUiEnabled={mutationUiEnabled}
        />
      ) : null}
      {activeSection === "orders" ? (
        <SalesMyOrders
          salesPersonId={salesPersonId}
          salesPersonName={salesPersonName}
          shops={shopsForLookup}
          productSkus={initialProductSkus}
          activeTargetProgress={activeTargetProgress}
          refreshKey={ordersRefreshKey}
          initialOrders={initialOrders}
          writesEnabled={writesEnabled}
          mutationUiEnabled={mutationUiEnabled}
        />
      ) : null}
      {activeSection === "collections" ? (
        <SalesCollections
          allShops={shopsForLookup}
          salesPersonId={salesPersonId}
          salesPersonName={salesPersonName}
          refreshKey={ordersRefreshKey + visitsRefreshKey}
          initialCollections={initialCollections}
          initialCollectionRawRowCount={initialCollectionRawRowCount}
          writesEnabled={writesEnabled}
          mutationUiEnabled={mutationUiEnabled}
          routeWorkAllowed={routeWorkAllowed}
          routeWorkMessage={routeWorkMessage}
        />
      ) : null}
      {activeSection === "targets" ? (
        <SalesTargets
          salesPersonId={salesPersonId}
          refreshKey={ordersRefreshKey}
          initialTargets={initialTargets}
          initialOrders={initialOrders}
        />
      ) : null}
    </div>
  );
}
