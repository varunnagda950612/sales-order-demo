import { LiveDataRefresh } from "@/components/data/live-data-refresh";
import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminCollections } from "@/features/admin/collections";
import { getCollectionsReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { isSupabaseAppMode } from "@/lib/config/app-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ManagerCollectionsPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "manager");
  const collectionsProps = await getCollectionsReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <LiveDataRefresh
        clearDeletedCollectionState
        autoRefresh={false}
        enabled={isSupabaseAppMode()}
        noticeLabel="New collections available"
        refreshEventName="manish:admin-collections-delta"
        tables={["collections"]}
      />
      <AdminCollections role="manager" actorId={profile.id} {...collectionsProps} />
    </RoleDashboard>
  );
}
