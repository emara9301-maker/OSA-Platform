import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Package } from "@/lib/packages";
import { canManagePackagesAndSettings } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function PackageList() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!canManagePackagesAndSettings(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase.from("packages").select("*").order("name");
  if (error) {
    return <p>Could not load packages: {error.message}</p>;
  }

  const items = (data ?? []) as Package[];
  return (
    <>
      <p>
        <Link href="/packages/new">Add package</Link>
      </p>
      {items.length === 0 ? (
        <p>No packages yet.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/packages/${item.id}`}>{item.name}</Link> — {item.sessions_count} sessions —{" "}
              {item.is_active ? "active" : "inactive"}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function PackagesPage() {
  return (
    <main>
      <h1>Packages</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <PackageList />
      </Suspense>
    </main>
  );
}
