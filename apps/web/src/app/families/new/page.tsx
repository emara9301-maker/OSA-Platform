import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createFamily } from "../actions";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function NewFamilyForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { error } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!canManageCondos(me.role)) {
    redirect(homePathFor(me.role));
  }

  return (
    <form action={createFamily}>
      <label>
        Family name
        <input name="name" required />
      </label>
      <button type="submit">Create family</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function NewFamilyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Add a family</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NewFamilyForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
