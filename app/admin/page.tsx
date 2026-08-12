import { RoleDashboard } from "@/components/layout/role-dashboard";
import { LiveDataRefresh } from "@/components/data/live-data-refresh";
import { AdminOrders } from "@/features/admin/orders";
import { getOrdersReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { isSupabaseAppMode } from "@/lib/config/app-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "admin");
  const ordersProps = await getOrdersReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <LiveDataRefresh
        clearDeletedOrderState
        autoRefresh={false}
        enabled={isSupabaseAppMode()}
        noticeLabel="New orders available"
        refreshEventName="manish:admin-orders-delta"
        tables={["orders"]}
      />
      <AdminOrders role="admin" actorId={profile.id} {...ordersProps} />
    </RoleDashboard>
  );
}
