import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminGpsRoute } from "@/features/admin/gps-route";
import { getGpsRouteReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ManagerGpsRoutePage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "manager");
  const gpsRouteProps = await getGpsRouteReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminGpsRoute {...gpsRouteProps} />
    </RoleDashboard>
  );
}
