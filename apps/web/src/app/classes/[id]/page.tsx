import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ClassForm } from "../class-form";
import { cancelSession, enrolStudent, unenrolStudent } from "../actions";
import { canManageCondos, homePathFor, isStaff } from "@/lib/permissions";
import { weekdays, type ClassRow, type SessionRow } from "@/lib/classes";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type Option = { id: string; name: string };

async function ClassDetail({
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

  const { data: classData } = await supabase.from("classes").select("*").eq("id", id).maybeSingle();
  if (!classData) {
    notFound();
  }
  const item = classData as ClassRow;
  const manage = canManageCondos(me.role);

  const { data: sessionData } = await supabase
    .from("sessions")
    .select("id, starts_at, status, cancel_reason")
    .eq("class_id", id)
    .order("starts_at")
    .limit(120);
  const sessions = (sessionData ?? []) as SessionRow[];

  const { data: enrolData } = await supabase
    .from("class_enrolments")
    .select("student_id, students(full_name)")
    .eq("class_id", id);
  const enrolled = (enrolData ?? []) as unknown as { student_id: string; students: { full_name: string }[] | null }[];

  let condos: Option[] = [];
  let coaches: Option[] = [];
  let levels: Option[] = [];
  let pools: { id: string; name: string; condo_id: string }[] = [];
  let students: Option[] = [];
  if (manage) {
    const { data: condoData } = await supabase.from("condos").select("id, name").order("name");
    const { data: coachData } = await supabase.from("profiles").select("id, username").eq("role", "coach");
    const { data: levelData } = await supabase.from("levels").select("id, name").order("sort_order");
    const { data: poolData } = await supabase.from("pools").select("id, name, condo_id").order("sort_order");
    const { data: studentData } = await supabase.from("students").select("id, full_name").order("full_name");
    condos = (condoData ?? []) as Option[];
    coaches = ((coachData ?? []) as { id: string; username: string | null }[]).map((c) => ({
      id: c.id,
      name: c.username ?? "no username",
    }));
    levels = (levelData ?? []) as Option[];
    pools = (poolData ?? []) as { id: string; name: string; condo_id: string }[];
    const enrolledIds = new Set(enrolled.map((row) => row.student_id));
    students = ((studentData ?? []) as { id: string; full_name: string }[])
      .filter((student) => !enrolledIds.has(student.id))
      .map((student) => ({ id: student.id, name: student.full_name }));
  }

  return (
    <>
      <p>
        {weekdays[item.weekday - 1].label} at {item.start_time.slice(0, 5)}, {item.duration_minutes} minutes, capacity{" "}
        {item.capacity}, {item.start_date} to {item.end_date}
      </p>

      <h2>Students ({enrolled.length} of {item.capacity})</h2>
      {enrolled.length === 0 ? (
        <p>No students enrolled yet.</p>
      ) : (
        <ul>
          {enrolled.map((row) => (
            <li key={row.student_id}>
              {row.students?.[0]?.full_name ?? "student"}
              {manage && (
                <form action={unenrolStudent} style={{ display: "inline" }}>
                  <input type="hidden" name="class_id" value={item.id} />
                  <input type="hidden" name="student_id" value={row.student_id} />
                  <button type="submit">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {manage && students.length > 0 && enrolled.length < item.capacity && (
        <form action={enrolStudent}>
          <input type="hidden" name="class_id" value={item.id} />
          <label>
            Add student
            <select name="student_id" required defaultValue="">
              <option value="" disabled>
                Choose a student
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Enrol</button>
        </form>
      )}

      <h2>Lessons</h2>
      {sessions.length === 0 ? (
        <p>No lessons.</p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <Link href={`/sessions/${session.id}`}>
                {new Date(session.starts_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}
              </Link>{" "}
              — {session.status}
              {session.cancel_reason ? ` (${session.cancel_reason})` : ""}
              {manage && session.status === "scheduled" && (
                <form action={cancelSession} style={{ display: "inline" }}>
                  <input type="hidden" name="class_id" value={item.id} />
                  <input type="hidden" name="session_id" value={session.id} />
                  <select name="kind" defaultValue="holiday">
                    <option value="holiday">Public holiday</option>
                    <option value="coach_absence">Coach absence</option>
                    <option value="rain">Rain (before it starts)</option>
                  </select>
                  <input name="reason" placeholder="Note (optional)" />
                  <button type="submit">Cancel lesson</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <>
          <h2>Edit</h2>
          <ClassForm item={item} condos={condos} pools={pools} coaches={coaches} levels={levels} error={error} />
        </>
      )}
    </>
  );
}

export default function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <h1>Class</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <ClassDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
