import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ageFrom, type Student } from "@/lib/students";
import { homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type OwnRecord = Pick<
  Student,
  "id" | "full_name" | "date_of_birth" | "status" | "start_level" | "current_level" | "start_date" | "photo_consent" | "data_consent"
>;

async function MyProfile() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data } = await supabase
    .from("students")
    .select("id, full_name, date_of_birth, status, start_level, current_level, start_date, photo_consent, data_consent")
    .eq("account_id", me.id)
    .maybeSingle();

  // Children are the students in the families this account is a guardian of.
  const { data: guardianOf } = await supabase.from("family_guardians").select("family_id").eq("profile_id", me.id);
  const familyIds = (guardianOf ?? []).map((row) => row.family_id);
  const { data: childData } = familyIds.length
    ? await supabase
        .from("students")
        .select("id, full_name, date_of_birth, status")
        .in("family_id", familyIds)
        .order("full_name")
    : { data: [] };
  const children = (childData ?? []) as Pick<Student, "id" | "full_name" | "date_of_birth" | "status">[];

  return (
    <>
      {data ? (
        <dl>
          <dt>Name</dt>
          <dd>{(data as OwnRecord).full_name}</dd>
          <dt>Age</dt>
          <dd>{ageFrom((data as OwnRecord).date_of_birth)}</dd>
          <dt>Status</dt>
          <dd>{(data as OwnRecord).status}</dd>
          <dt>Start level</dt>
          <dd>{(data as OwnRecord).start_level ?? "-"}</dd>
          <dt>Current level</dt>
          <dd>{(data as OwnRecord).current_level ?? "-"}</dd>
          <dt>Start date</dt>
          <dd>{(data as OwnRecord).start_date ?? "-"}</dd>
          <dt>Photo and video consent</dt>
          <dd>{(data as OwnRecord).photo_consent ? "Yes" : "No"}</dd>
          <dt>Data consent</dt>
          <dd>{(data as OwnRecord).data_consent ? "Yes" : "No"}</dd>
        </dl>
      ) : (
        <p>Your student profile is being prepared. The OSA office will confirm it.</p>
      )}

      <p>
        <Link href="/link-child">Link my child</Link>
      </p>

      <h2>My children</h2>
      {children.length === 0 ? (
        <p>No children linked yet.</p>
      ) : (
        <ul>
          {children.map((child) => (
            <li key={child.id}>
              <Link href={`/students/${child.id}`}>{child.full_name}</Link> — age {ageFrom(child.date_of_birth)} — {child.status}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function MyProfilePage() {
  return (
    <main>
      <h1>My profile</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <MyProfile />
      </Suspense>
    </main>
  );
}
