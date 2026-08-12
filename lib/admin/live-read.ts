import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseAppMode } from "@/lib/config/app-mode";
import {
  areSupabaseWritesEnabled,
  isMutationPreviewEnabled,
} from "@/lib/config/write-mode";
import {
  readSupabaseAreaRouteSchedules,
  readSupabaseCollectionSummary,
  readSupabaseCollectionPageWithShops,
  readSupabaseOrderListWithShops,
  readSupabaseOrderSummary,
  readSupabaseOrders,
  readSupabaseOrdersWithShops,
  readSupabaseProductSkus,
  readSupabaseProfiles,
  readSupabaseSalesDaySessions,
  readSupabaseSalesTargets,
  readSupabaseShopAreas,
  readSupabaseShops,
  readSupabaseRouteOverrides,
  readSupabaseVisitProofsWithShops,
  mergeUniqueShops,
} from "@/lib/repositories/supabase-read";
import { getIndiaDate, getUtcRangeForIndiaDate } from "@/lib/dates/india";
import type { LocalSalesTarget } from "@/types/domain";

const initialScreenRowLimit = 101;

function getTargetOrderRange(targets: LocalSalesTarget[]) {
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

  return {
    createdAtFrom: getUtcRangeForIndiaDate(startDate).start,
    createdAtTo: getUtcRangeForIndiaDate(endDate).end,
  };
}

export async function getOrdersReadProps(supabase: SupabaseClient) {
  const writesEnabled = areSupabaseWritesEnabled();
  const mutationUiEnabled = writesEnabled || isMutationPreviewEnabled();

  if (!isSupabaseAppMode()) {
    return { writesEnabled, mutationUiEnabled };
  }

  const todayRange = getUtcRangeForIndiaDate(getIndiaDate());
  const [ordersRead, initialAreaOptions, initialUsers, initialOrderSummary] = await Promise.all([
    readSupabaseOrderListWithShops(supabase, {
      createdAtFrom: todayRange.start,
      createdAtTo: todayRange.end,
      ascending: true,
      limit: initialScreenRowLimit,
    }),
    readSupabaseShopAreas(supabase),
    readSupabaseProfiles(supabase),
    readSupabaseOrderSummary(supabase, {
      createdAtFrom: todayRange.start,
      createdAtTo: todayRange.end,
    }),
  ]);
  const initialOrders = ordersRead.orders;
  const initialShops = ordersRead.shops;

  return {
    initialOrders,
    initialShops,
    initialAreaOptions,
    initialUsers,
    initialOrderSummary,
    writesEnabled,
    mutationUiEnabled,
  };
}

export async function getCollectionsReadProps(supabase: SupabaseClient) {
  const writesEnabled = areSupabaseWritesEnabled();
  const mutationUiEnabled = writesEnabled || isMutationPreviewEnabled();

  if (!isSupabaseAppMode()) {
    return { writesEnabled, mutationUiEnabled };
  }

  const todayRange = getUtcRangeForIndiaDate(getIndiaDate());
  const [collectionsRead, initialAreaOptions, initialUsers, initialCollectionSummary] = await Promise.all([
    readSupabaseCollectionPageWithShops(supabase, {
      createdAtFrom: todayRange.start,
      createdAtTo: todayRange.end,
      ascending: true,
      limit: initialScreenRowLimit - 1,
    }),
    readSupabaseShopAreas(supabase),
    readSupabaseProfiles(supabase),
    readSupabaseCollectionSummary(supabase, {
      createdAtFrom: todayRange.start,
      createdAtTo: todayRange.end,
    }),
  ]);
  const initialCollections = collectionsRead.collections;
  const initialShops = collectionsRead.shops;

  return {
    initialCollections,
    initialCollectionRawRowCount: collectionsRead.fetchedRowCount,
    initialCollectionSummary,
    initialShops,
    initialAreaOptions,
    initialUsers,
    writesEnabled,
    mutationUiEnabled,
  };
}

export async function getVisitStatusReadProps(supabase: SupabaseClient) {
  if (!isSupabaseAppMode()) {
    return {};
  }

  const todayRange = getUtcRangeForIndiaDate(getIndiaDate());
  const [
    ordersRead,
    baseShops,
    visitsRead,
    initialUsers,
    initialRouteSchedules,
    initialRouteOverrides,
  ] = await Promise.all([
    readSupabaseOrdersWithShops(supabase, {
      createdAtFrom: todayRange.start,
      createdAtTo: todayRange.end,
    }),
    readSupabaseShops(supabase),
    readSupabaseVisitProofsWithShops(supabase, {
      capturedAtFrom: todayRange.start,
      capturedAtTo: todayRange.end,
    }),
    readSupabaseProfiles(supabase),
    readSupabaseAreaRouteSchedules(supabase),
    readSupabaseRouteOverrides(supabase),
  ]);
  const initialOrders = ordersRead.orders;
  const initialVisits = visitsRead.visits;
  const initialShops = mergeUniqueShops(baseShops, ordersRead.shops, visitsRead.shops);

  return {
    initialOrders,
    initialShops,
    initialVisits,
    initialUsers,
    initialRouteSchedules,
    initialRouteOverrides,
  };
}

export async function getDayLogReadProps(supabase: SupabaseClient) {
  if (!isSupabaseAppMode()) {
    return {};
  }

  const [initialSessions, initialUsers] = await Promise.all([
    readSupabaseSalesDaySessions(supabase),
    readSupabaseProfiles(supabase),
  ]);

  return { initialSessions, initialUsers };
}

export async function getTargetsReadProps(supabase: SupabaseClient) {
  const writesEnabled = areSupabaseWritesEnabled();
  const mutationUiEnabled = writesEnabled || isMutationPreviewEnabled();

  if (!isSupabaseAppMode()) {
    return { writesEnabled, mutationUiEnabled };
  }

  const [initialTargets, initialProductSkus, initialUsers] = await Promise.all([
    readSupabaseSalesTargets(supabase),
    readSupabaseProductSkus(supabase),
    readSupabaseProfiles(supabase),
  ]);
  const targetOrderRange = getTargetOrderRange(initialTargets);
  const initialOrders = targetOrderRange
    ? await readSupabaseOrders(supabase, targetOrderRange)
    : [];

  return { initialTargets, initialOrders, initialProductSkus, initialUsers, writesEnabled, mutationUiEnabled };
}

export async function getShopsReadProps(supabase: SupabaseClient) {
  const writesEnabled = areSupabaseWritesEnabled();
  const mutationUiEnabled = writesEnabled || isMutationPreviewEnabled();

  if (!isSupabaseAppMode()) {
    return { writesEnabled, mutationUiEnabled };
  }

  const [initialShops, initialUsers, initialRouteOverrides, initialAreaRouteSchedules] = await Promise.all([
    readSupabaseShops(supabase),
    readSupabaseProfiles(supabase),
    readSupabaseRouteOverrides(supabase),
    readSupabaseAreaRouteSchedules(supabase),
  ]);
  return {
    initialShops,
    initialUsers,
    initialRouteOverrides,
    initialAreaRouteSchedules,
    writesEnabled,
    mutationUiEnabled,
  };
}

export async function getProductsReadProps(supabase: SupabaseClient) {
  const writesEnabled = areSupabaseWritesEnabled();
  const mutationUiEnabled = writesEnabled || isMutationPreviewEnabled();

  if (!isSupabaseAppMode()) {
    return { writesEnabled, mutationUiEnabled };
  }

  const initialProductSkus = await readSupabaseProductSkus(supabase);
  return { initialProductSkus, writesEnabled, mutationUiEnabled };
}

export async function getGpsRouteReadProps(supabase: SupabaseClient) {
  if (!isSupabaseAppMode()) {
    return {};
  }

  const [baseShops, initialUsers] = await Promise.all([
    readSupabaseShops(supabase),
    readSupabaseProfiles(supabase),
  ]);

  return { initialShops: baseShops, initialVisits: [], initialUsers };
}

export async function getUsersReadProps(supabase: SupabaseClient) {
  const writesEnabled = areSupabaseWritesEnabled();
  const mutationUiEnabled = writesEnabled || isMutationPreviewEnabled();

  if (!isSupabaseAppMode()) {
    return { writesEnabled, mutationUiEnabled };
  }

  const initialUsers = await readSupabaseProfiles(supabase);
  return { initialUsers, writesEnabled, mutationUiEnabled };
}
