import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canManageCondos, canSeeAdminAreas, isStaff } from "@/lib/permissions";
import { countMissingReports } from "@/lib/reports";
import { getCurrentProfile, type Profile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

// Only the links this account is allowed to open. A student never sees the admin areas.
function navLinks(profile: Profile) {
  const links: { href: string; label: string }[] = [];
  if (isStaff(profile.role)) {
    links.push({ href: "/condos", label: "Condos" });
  }
  if (isStaff(profile.role)) {
    links.push({ href: "/students", label: "Students" });
    links.push({ href: "/classes", label: "Classes" });
    links.push({ href: "/schedule", label: "Schedule" });
    links.push({ href: "/incidents", label: "Incidents" });
  }
  if (canManageCondos(profile.role)) {
    links.push({ href: "/families", label: "Families" });
    links.push({ href: "/operations", label: "Operations" });
    links.push({ href: "/billing", label: "Billing" });
  }
  if (canSeeAdminAreas(profile.role)) {
    links.push({ href: "/packages", label: "Packages" });
    links.push({ href: "/settings", label: "Settings" });
    links.push({ href: "/audit-log", label: "Audit log" });
  }
  if (canSeeAdminAreas(profile.role) || profile.role === "head_coach") {
    links.push({ href: "/settings/roles", label: "Roles" });
  }
  return links;
}

async function ProfileHome() {
  await connection();
  const supabase = await createServerSupabase();
  const profile = await getCurrentProfile(supabase);

  if (!profile) {
    redirect("/login");
  }

  if (!profile.is_active) {
    return <p>This account is not active. Contact the owner.</p>;
  }

  if (!isStaff(profile.role)) {
    redirect("/me");
  }

  const missingReports = isStaff(profile.role) ? await countMissingReports(supabase) : 0;

  const { count: pendingLinks } = await supabase
    .from("guardian_link_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <>
      <p>Welcome, {profile.username ?? profile.full_name}</p>
      <p>Role: {profile.role}</p>
      {missingReports > 0 && (
        <p>
          <Link href="/schedule">Reports missing: {missingReports} student lessons</Link>
        </p>
      )}
      {canManageCondos(profile.role) && (pendingLinks ?? 0) > 0 && (
        <p>
          <Link href="/link-requests">Link requests: {pendingLinks} waiting</Link>
        </p>
      )}
      <nav>
        {navLinks(profile).map((link, index) => (
          <span key={link.href}>
            {index > 0 && " | "}
            <Link href={link.href}>{link.label}</Link>
          </span>
        ))}
      </nav>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <ProfileHome />
      </Suspense>
    </main>
  );
}
