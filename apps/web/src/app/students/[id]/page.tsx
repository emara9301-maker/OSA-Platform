import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { assignCoach, linkAccount, unassignCoach } from "../actions";
import { StudentForm } from "../student-form";
import { ageFrom, type Family, type Student } from "@/lib/students";
import { canManageCondos } from "@/lib/permissions";
import { weekdays } from "@/lib/classes";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { requestTime } from "@/lib/clock";

type Option = { id: string; name: string };
type Coach = { coach_id: string; profiles: { username: string | null } | null };
type Account = { id: string; username: string | null };

async function StudentDetail({
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
  // Row-level security decides who can see this student: staff, the assigned coach, a guardian, or the student.
  const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (!data) {
    if (!isStaff(me.role)) {
      redirect(homePathFor(me.role));
    }
    notFound();
  }
  const student = data as Student;
  const manage = canManageCondos(me.role);

  if (!manage) {
    const { data: enrolData } = await supabase
      .from("class_enrolments")
      .select("classes(id, name, weekday, start_time)")
      .eq("student_id", id);
    const classList = ((enrolData ?? []) as unknown as { classes: { id: string; name: string; weekday: number; start_time: string } | null }[])
      .map((row) => row.classes)
      .filter((row): row is { id: string; name: string; weekday: number; start_time: string } => row !== null);
    const { data: historyDays } = await supabase.rpc("staff_setting", { p_key: "student_history_days" });
    const since = new Date((await requestTime()) - Number(historyDays) * 24 * 60 * 60 * 1000).toISOString();
    const classIds = classList.map((c) => c.id);
    const { data: lessonData } = await supabase
      .from("sessions")
      .select("id, starts_at, status, class_id")
      .in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("starts_at", since)
      .order("starts_at")
      .limit(30);
    const lessons = (lessonData ?? []) as { id: string; starts_at: string; status: string; class_id: string }[];
    const { data: markData } = await supabase
      .from("attendance")
      .select("session_id, status, reason")
      .eq("student_id", id)
      .in("session_id", lessons.length ? lessons.map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"]);
    const marks = new Map(
      ((markData ?? []) as { session_id: string; status: string; reason: string | null }[]).map((m) => [m.session_id, m]),
    );

    return (
      <>
        <dl>
          <dt>Full name</dt>
          <dd>{student.full_name}</dd>
          <dt>Nickname</dt>
          <dd>{student.nickname ?? "-"}</dd>
          <dt>Age</dt>
          <dd>{ageFrom(student.date_of_birth)}</dd>
          <dt>Language</dt>
          <dd>{student.language ?? "-"}</dd>
          {manage && (
            <>
              <dt>Status</dt>
              <dd>{student.status}</dd>
            </>
          )}
          <dt>Start level</dt>
          <dd>{student.start_level ?? "-"}</dd>
          <dt>Current level</dt>
          <dd>{student.current_level ?? "-"}</dd>
          <dt>Start date</dt>
          <dd>{student.start_date ?? "-"}</dd>
          <dt>Medical notes</dt>
          <dd>{student.medical_notes ?? "-"}</dd>
          <dt>Allergies</dt>
          <dd>{student.allergies ?? "-"}</dd>
          <dt>Emergency contact</dt>
          <dd>
            {student.emergency_contact_name ?? "-"} {student.emergency_contact_phone ?? ""}
          </dd>
          <dt>Photo and video consent</dt>
          <dd>{student.photo_consent ? "Yes" : "No"}</dd>
          <dt>Data consent</dt>
          <dd>{student.data_consent ? "Yes" : "No"}</dd>
          <dt>QR code ID</dt>
          <dd>
            <code>{student.qr_token}</code>
          </dd>
        </dl>

        <h2>Classes</h2>
        {classList.length === 0 ? (
          <p>Not enrolled in a class yet.</p>
        ) : (
          <ul>
            {classList.map((c) => (
              <li key={c.id}>
                {c.name} — {weekdays[c.weekday - 1].label} at {c.start_time.slice(0, 5)}
              </li>
            ))}
          </ul>
        )}

        <h2>Lessons</h2>
        {lessons.length === 0 ? (
          <p>No lessons in the last 14 days or coming up.</p>
        ) : (
          <ul>
            {lessons.map((lesson) => {
              const mark = marks.get(lesson.id);
              const when = new Date(lesson.starts_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
              const attendance = mark
                ? `${mark.status}${mark.reason ? ` (${mark.reason})` : ""}`
                : new Date(lesson.starts_at) > new Date()
                  ? "upcoming"
                  : "not marked yet";
              return (
                <li key={lesson.id}>
                  {when} — {lesson.status} — attendance: {attendance}
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const { data: condoData } = await supabase.from("condos").select("id, name").order("name");
  const { data: familyData } = await supabase.from("families").select("id, name").order("name");
  const { data: coachData } = await supabase
    .from("student_coaches")
    .select("coach_id, profiles(username)")
    .eq("student_id", id);
  const { data: staffCoachData } = await supabase.from("profiles").select("id, username").eq("role", "coach");
  const { data: accountData } = await supabase.from("profiles").select("id, username").order("username");

  const coaches = (coachData ?? []) as unknown as Coach[];
  const assignedIds = new Set(coaches.map((coach) => coach.coach_id));
  const availableCoaches = ((staffCoachData ?? []) as Account[]).filter((coach) => !assignedIds.has(coach.id));

  return (
    <>
      <p>Age: {ageFrom(student.date_of_birth)}</p>
      <p>
        Login account:{" "}
        {student.account_id
          ? ((accountData ?? []) as Account[]).find((a) => a.id === student.account_id)?.username ?? "linked"
          : "not linked"}
      </p>
      <p>
        QR code ID: <code>{student.qr_token}</code>
      </p>
      {student.family_id && (
        <p>
          <Link href={`/families/${student.family_id}`}>Back to family</Link>
        </p>
      )}

      <h2>Edit</h2>
      <StudentForm
        student={student}
        condos={(condoData ?? []) as Option[]}
        families={(familyData ?? []) as Family[]}
        error={error}
      />

      <h2>Coaches</h2>
      {coaches.length === 0 ? (
        <p>No coach assigned yet. Only assigned coaches can see this student.</p>
      ) : (
        <ul>
          {coaches.map((coach) => (
            <li key={coach.coach_id}>
              {coach.profiles?.username ?? "no username"}
              <form action={unassignCoach} style={{ display: "inline" }}>
                <input type="hidden" name="student_id" value={student.id} />
                <input type="hidden" name="coach_id" value={coach.coach_id} />
                <button type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {availableCoaches.length > 0 && (
        <form action={assignCoach}>
          <input type="hidden" name="student_id" value={student.id} />
          <label>
            Coach
            <select name="coach_id" required defaultValue="">
              <option value="" disabled>
                Choose a coach
              </option>
              {availableCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.username ?? "no username"}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Assign coach</button>
        </form>
      )}

      <h2>Login account</h2>
      <form action={linkAccount}>
        <input type="hidden" name="student_id" value={student.id} />
        <label>
          Adult student account
          <select name="account_id" defaultValue={student.account_id ?? ""}>
            <option value="">Not linked</option>
            {((accountData ?? []) as Account[]).map((account) => (
              <option key={account.id} value={account.id}>
                {account.username ?? "no username"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Save link</button>
      </form>
    </>
  );
}

export default function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <h1>Student</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <StudentDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
