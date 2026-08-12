import { RoleDashboard } from "@/components/layout/role-dashboard";
import { LiveDataRefresh } from "@/components/data/live-data-refresh";
import { SalesLocalDashboard } from "@/features/sales/sales-local-dashboard";
import { requireRoleProfile } from "@/lib/auth/profile";
import { isLocalAppMode } from "@/lib/config/app-mode";
import {
  areSupabaseWritesEnabled,
  isMutationPreviewEnabled,
} from "@/lib/config/write-mode";
import { getIndiaDate, getUtcRangeForIndiaDate } from "@/lib/dates/india";
import { getEmptySalesRouteData } from "@/lib/local/sales-route-snapshot";
import {
  mergeUniqueShops,
  readSupabaseCollectionPageWithShops,
  readSupabaseOrderListWithShops,
  readSupabaseOrders,
  readSupabaseSalesDaySessionForDate,
  readSupabaseSalesTargets,
  readSupabaseShops,
} from "@/lib/repositories/supabase-read";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTargetOrderDateRange } from "@/lib/targets/progress";
import { getSalesRouteData } from "@/services/sales-shops";
import type { LocalOrder, LocalSalesTarget } from "@/types/domain";

export type SalesSection = "shops" | "adhoc-order" | "orders" | "collections" | "targets";

async function getActiveTargetReadProps(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  salesPersonId: string,
) {
  const initialTargets = await readSupabaseSalesTargets(supabase, {
    salesPersonId,
  });
  const orderRange = getActiveTargetOrderDateRange(initialTargets);
  const initialOrders = orderRange
    ? await readSupabaseOrders(supabase, {
        salesPersonId,
        createdAtFrom: orderRange.createdAtFrom,
        createdAtTo: orderRange.createdAtTo,
      })
    : [];

  return { initialTargets, initialOrders };
}

function mergeUniqueOrders(...orderGroups: LocalOrder[][]) {
  const orderById = new Map<string, LocalOrder>();

  orderGroups.flat().forEach((order) => {
    orderById.set(order.id, order);
  });

  return Array.from(orderById.values());
}

function getTargetOrderDateRange(targets: LocalSalesTarget[]) {
  if (!targets.length) {
    return null;
  }

  const startDate = targets.reduce(
    (currentDate, target) =>
      target.startDate < currentDate ? target.startDate : currentDate,
    targets[0].startDate,
  );
  const endDate = targets.reduce(
    (currentDate, target) =>
      target.endDate > currentDate ? target.endDate : currentDate,
    targets[0].endDate,
  );
  const startRange = getUtcRangeForIndiaDate(startDate);
  const endRange = getUtcRangeForIndiaDate(endDate);

  return {
    createdAtFrom: startRange.start,
    createdAtTo: endRange.end,
  };
}

async function getSalesSectionData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  activeSection: SalesSection,
  salesPersonId: string,
) {
  if (activeSection === "shops") {
    const today = getIndiaDate();
    const todayRange = getUtcRangeForIndiaDate(today);
    const [routeData, targetReadProps, todayOrders] = await Promise.all([
      getSalesRouteData(supabase, salesPersonId),
      getActiveTargetReadProps(supabase, salesPersonId),
      readSupabaseOrders(supabase, {
        salesPersonId,
        createdAtFrom: todayRange.start,
        createdAtTo: todayRange.end,
      }),
    ]);

    return {
      routeData,
      liveReadProps: {
        initialShops: routeData.shops,
        ...targetReadProps,
        initialOrders: mergeUniqueOrders(targetReadProps.initialOrders, todayOrders),
      },
    };
  }

  if (activeSection === "adhoc-order") {
    const [initialShops, targetReadProps] = await Promise.all([
      readSupabaseShops(supabase, { salesPersonId }),
      getActiveTargetReadProps(supabase, salesPersonId),
    ]);

    return {
      routeData: getEmptySalesRouteData(),
      liveReadProps: { initialShops, ...targetReadProps },
    };
  }

  if (activeSection === "orders") {
    const today = getIndiaDate();
    const todayRange = getUtcRangeForIndiaDate(today);
    const [ordersRead, assignedShops, initialTargets] = await Promise.all([
      readSupabaseOrderListWithShops(supabase, {
        salesPersonId,
        createdAtFrom: todayRange.start,
        createdAtTo: todayRange.end,
        ascending: true,
        limit: 101,
      }),
      readSupabaseShops(supabase, { salesPersonId }),
      readSupabaseSalesTargets(supabase, { salesPersonId }),
    ]);

    return {
      routeData: getEmptySalesRouteData(),
      liveReadProps: {
        initialOrders: ordersRead.orders,
        initialShops: mergeUniqueShops(assignedShops, ordersRead.shops),
        initialTargets,
      },
    };
  }

  if (activeSection === "collections") {
    const today = getIndiaDate();
    const todayRange = getUtcRangeForIndiaDate(today);
    const [collectionsRead, assignedShops] = await Promise.all([
      readSupabaseCollectionPageWithShops(supabase, {
        salesPersonId,
        createdAtFrom: todayRange.start,
        createdAtTo: todayRange.end,
        ascending: true,
        limit: 100,
      }),
      readSupabaseShops(supabase, { salesPersonId }),
    ]);

    return {
      routeData: getEmptySalesRouteData(),
      liveReadProps: {
        initialCollections: collectionsRead.collections,
        initialCollectionRawRowCount: collectionsRead.fetchedRowCount,
        initialShops: mergeUniqueShops(assignedShops, collectionsRead.shops),
      },
    };
  }

  const initialTargets = await readSupabaseSalesTargets(supabase, { salesPersonId });
  const targetOrderRange = getTargetOrderDateRange(initialTargets);
  const initialOrders = targetOrderRange
    ? await readSupabaseOrders(supabase, {
        salesPersonId,
        ...targetOrderRange,
      })
    : [];

  return {
    routeData: getEmptySalesRouteData(),
    liveReadProps: {
      initialTargets,
      initialOrders,
    },
  };
}

export async function SalesPageContent({ activeSection }: { activeSection: SalesSection }) {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "sales");
  const localMode = isLocalAppMode();
  const today = getIndiaDate();
  const { routeData, liveReadProps, initialDaySession } = localMode
    ? {
        routeData: getEmptySalesRouteData(),
        liveReadProps: {},
        initialDaySession: null,
      }
    : {
        ...(await getSalesSectionData(supabase, activeSection, profile.id)),
        initialDaySession: await readSupabaseSalesDaySessionForDate(
          supabase,
          profile.id,
          today,
        ),
      };

  return (
    <RoleDashboard profile={profile}>
      <LiveDataRefresh
        clearDeletedOrderState
        enabled={
          !localMode &&
          ["shops", "adhoc-order", "orders", "targets"].includes(activeSection)
        }
        tables={[
          { table: "orders", filter: `sales_person_id=eq.${profile.id}` },
          { table: "sales_targets", filter: `sales_person_id=eq.${profile.id}` },
        ]}
        refreshEventName={
          activeSection === "orders" ? "manish:sales-orders-delta" : undefined
        }
      />
      <LiveDataRefresh
        clearDeletedCollectionState
        enabled={!localMode && activeSection === "collections"}
        tables={[{ table: "collections", filter: `sales_person_id=eq.${profile.id}` }]}
        refreshEventName="manish:sales-collections-delta"
      />
      <SalesLocalDashboard
        routeData={routeData}
        salesPersonId={profile.id}
        salesPersonName={profile.fullName}
        localMode={localMode}
        activeSection={activeSection}
        initialDaySession={initialDaySession}
        geofenceMeters={profile.geofenceMeters}
        writesEnabled={localMode || areSupabaseWritesEnabled()}
        mutationUiEnabled={
          localMode ||
          areSupabaseWritesEnabled() ||
          isMutationPreviewEnabled()
        }
        {...liveReadProps}
      />
    </RoleDashboard>
  );
}
