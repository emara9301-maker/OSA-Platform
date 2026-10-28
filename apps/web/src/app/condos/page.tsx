import { homePathFor } from "@/lib/permissions";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canManageCondos, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import type { Condo } from "@/lib/condos";

async function CondoList() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase.from("condos").select("*").order("name");
  if (error) {
    return <p>Could not load condos: {error.message}</p>;
  }

  const condos = (data ?? []) as Condo[];
  return (
    <>
      {canManageCondos(me.role) && (
        <p>
          <Link href="/condos/new">Add condo</Link>
        </p>
      )}
      {condos.length === 0 ? (
        <p>No condos yet.</p>
      ) : (
        <ul>
          {condos.map((condo) => (
            <li key={condo.id}>
              <Link href={`/condos/${condo.id}`}>{condo.name}</Link> — {condo.area ?? "no area"} — {condo.status}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function CondosPage() {
  return (
    <main>
      <h1>Condos</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <CondoList />
      </Suspense>
    </main>
  );
}
