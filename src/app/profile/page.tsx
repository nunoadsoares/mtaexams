import { ProfileDashboard } from "@/components/profile-dashboard";
import { ensureDefaultPdfImported } from "@/lib/importers/service";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  await ensureDefaultPdfImported();
  return <ProfileDashboard />;
}
