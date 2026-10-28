import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CondoForm } from "../condo-form";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function NewCondoForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  await connection();
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
  return <CondoForm condo={null} error={error} />;
}

export default function NewCondoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Add a condo</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NewCondoForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
