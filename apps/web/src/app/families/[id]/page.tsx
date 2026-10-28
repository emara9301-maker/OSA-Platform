import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { addGuardian, removeGuardian } from "../actions";
import { ageFrom, type Family, type Student } from "@/lib/students";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type Guardian = { profile_id: string; relationship: string; profiles: { username: string | null } | null };
type AccountOption = { id: string; username: string | null };

async function FamilyDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data: familyData } = await supabase.from("families").select("id, name").eq("id", id).maybeSingle();
  if (!familyData) {
    notFound();
  }
  const family = familyData as Family;
  const manage = canManageCondos(me.role);

  const { data: guardianData } = await supabase
    .from("family_guardians")
    .select("profile_id, relationship, profiles(username)")
    .eq("family_id", id);
  const guardians = (guardianData ?? []) as unknown as Guardian[];

  const { data: studentData } = await supabase
    .from("students")
    .select("id, full_name, date_of_birth, status")
    .eq("family_id", id)
    .order("full_name");
  const children = (studentData ?? []) as Pick<Student, "id" | "full_name" | "date_of_birth" | "status">[];

  let accounts: AccountOption[] = [];
  if (manage) {
    const { data: accountData } = await supabase.from("profiles").select("id, username").order("username");
    accounts = (accountData ?? []) as AccountOption[];
  }

  return (
    <>
      <h2>Guardians</h2>
      {guardians.length === 0 ? (
        <p>No guardians linked yet.</p>
      ) : (
        <ul>
          {guardians.map((guardian) => (
            <li key={guardian.profile_id}>
              {guardian.profiles?.username ?? "no username"} ({guardian.relationship})
              {manage && (
                <form action={removeGuardian} style={{ display: "inline" }}>
                  <input type="hidden" name="family_id" value={family.id} />
                  <input type="hidden" name="profile_id" value={guardian.profile_id} />
                  <button type="submit">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <form action={addGuardian}>
          <input type="hidden" name="family_id" value={family.id} />
          <label>
            Account
            <select name="profile_id" required defaultValue="">
              <option value="" disabled>
                Choose an account
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username ?? "no username"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Relationship
            <input name="relationship" placeholder="Mother, father, helper..." required />
          </label>
          <button type="submit">Link guardian</button>
        </form>
      )}

      <h2>Children</h2>
      {manage && (
        <p>
          <Link href={`/students/new?family=${family.id}`}>Add child</Link>
        </p>
      )}
      {children.length === 0 ? (
        <p>No children in this family yet.</p>
      ) : (
        <ul>
          {children.map((child) => (
            <li key={child.id}>
              <Link href={`/students/${child.id}`}>{child.full_name}</Link> — age {ageFrom(child.date_of_birth)} —{" "}
              {child.status}
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}

export default function FamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <h1>Family</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <FamilyDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
