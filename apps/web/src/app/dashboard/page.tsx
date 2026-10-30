import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canManageCondos, isStaff } from "@/lib/permissions";
import { staffGroups } from "@/lib/nav";
import { countMissingReports } from "@/lib/reports";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

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
    // A family or student without a condo yet starts on the home page, to choose one.
    const { data: condoId } = await supabase.rpc("my_condo_id");
    redirect(condoId ? "/me" : "/");
  }

  const { data: missingDays } = isStaff(profile.role)
    ? await supabase.rpc("staff_setting", { p_key: "missing_report_days" })
    : { data: 0 };
  const missingReports = isStaff(profile.role) ? await countMissingReports(supabase, Number(missingDays)) : 0;

  const { count: pendingLinks } = await supabase
    .from("guardian_link_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const showLinks = canManageCondos(profile.role) && (pendingLinks ?? 0) > 0;

  return (
    <>
      <section className="welcome">
        <div>
          <p className="welcome-hi">Welcome back</p>
          <h1>{profile.username ?? profile.full_name}</h1>
        </div>
        <span className="badge">{profile.role.replace(/_/g, " ")}</span>
      </section>

      {(missingReports > 0 || showLinks) && (
        <div className="alerts">
          {missingReports > 0 && (
            <Link className="alert-card" href="/schedule">
              <strong>{missingReports}</strong> student lessons are missing reports
            </Link>
          )}
          {showLinks && (
            <Link className="alert-card" href="/link-requests">
              <strong>{pendingLinks}</strong> link requests waiting
            </Link>
          )}
        </div>
      )}

      {staffGroups(profile.role).map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <div className="tiles">
            {group.links.map((link) => (
              <Link key={link.href} className="tile" href={link.href}>
                <span className="tile-title">{link.label}</span>
                <span className="tile-hint">{link.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function DashboardPage() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <ProfileHome />
      </Suspense>
    </main>
  );
}
