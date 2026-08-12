import { LiveDataRefresh } from "@/components/data/live-data-refresh";
import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminDayLog } from "@/features/admin/day-log";
import { getDayLogReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { isLocalAppMode } from "@/lib/config/app-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ManagerDayLogPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "manager");
  const dayLogProps = await getDayLogReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <LiveDataRefresh
        autoRefresh={false}
        enabled={!isLocalAppMode()}
        noticeLabel="New day log data available"
        tables={["sales_day_sessions"]}
      />
      <AdminDayLog {...dayLogProps} />
    </RoleDashboard>
  );
}
