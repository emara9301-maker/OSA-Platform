import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { StudentForm } from "../student-form";
import type { Family } from "@/lib/students";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function NewStudentForm({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; family?: string }>;
}) {
  await connection();
  const { error, family } = await searchParams;
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

  const { data: condos } = await supabase.from("condos").select("id, name").order("name");
  const { data: families } = await supabase.from("families").select("id, name").order("name");

  return (
    <StudentForm
      student={null}
      condos={(condos ?? []) as { id: string; name: string }[]}
      families={(families ?? []) as Family[]}
      defaultFamilyId={family}
      error={error}
    />
  );
}

export default function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; family?: string }>;
}) {
  return (
    <main>
      <h1>Add a student</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NewStudentForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
