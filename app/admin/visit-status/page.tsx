import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminVisitStatus } from "@/features/admin/visit-status";
import { getVisitStatusReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminVisitStatusPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "admin");
  const visitStatusProps = await getVisitStatusReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminVisitStatus {...visitStatusProps} />
    </RoleDashboard>
  );
}
