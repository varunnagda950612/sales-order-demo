import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminTargets } from "@/features/admin/targets";
import { getTargetsReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ManagerTargetsPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "manager");
  const targetsProps = await getTargetsReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminTargets role="manager" {...targetsProps} />
    </RoleDashboard>
  );
}
