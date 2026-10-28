import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Family } from "@/lib/students";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function FamilyList() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase.from("families").select("id, name").order("name");
  if (error) {
    return <p>Could not load families: {error.message}</p>;
  }

  const families = (data ?? []) as Family[];
  return (
    <>
      {canManageCondos(me.role) && (
        <p>
          <Link href="/families/new">Add family</Link>
        </p>
      )}
      {families.length === 0 ? (
        <p>No families yet.</p>
      ) : (
        <ul>
          {families.map((family) => (
            <li key={family.id}>
              <Link href={`/families/${family.id}`}>{family.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function FamiliesPage() {
  return (
    <main>
      <h1>Families</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <FamilyList />
      </Suspense>
    </main>
  );
}
