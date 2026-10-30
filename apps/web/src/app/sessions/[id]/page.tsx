import { connection } from "next/server";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AttendanceForm } from "../attendance-form";
import { ReportsForm } from "../reports-form";
import { cancelWeatherHold, recordThunder, resumeWeatherHold, startWeatherHold } from "../rain-actions";
import { proposeMakeUp } from "../make-up-actions";
import { canManageCondos } from "@/lib/permissions";
import { ageFrom } from "@/lib/students";
import { homePathFor, isStaff } from "@/lib/permissions";
import { requestTime } from "@/lib/clock";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

const rainResults: Record<string, string> = {
  paused: "Class paused for thunder. Families have been told.",
  resumed: "Class resumed. Families have been told.",
  counted: "Most of the lesson was taught, so it counts as a session.",
  cancelled: "Class cancelled. Every enrolled student has a make-up token.",
  made: "Make-up lesson booked. The families have been told.",
};

const paymentLabels: Record<string, string> = {
  paid: "Paid",
  due_soon: "Due soon",
  overdue: "Overdue",
  on_hold: "On hold",
};

const paymentLabel = (status: string | null | undefined) => (status ? paymentLabels[status] ?? status : "-");

const timeInMalaysia = (value: string) =>
  new Date(value).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" });

type Enrolled = {
  student_id: string;
  students: {
    full_name: string;
    date_of_birth: string;
    medical_notes: string | null;
    allergies: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null;
};

async function SessionAttendance({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; reports_saved?: string; rain?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { error, saved, reports_saved, rain } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  // A pause that has passed the middle of its lesson is ended before the page is shown.
  await supabase.rpc("settle_weather_holds");

  const { data: sessionData } = await supabase
    .from("sessions")
    .select(
      "id, starts_at, ends_at, status, class_id, is_make_up, cancel_reason, rain_stopped, hold_started_at, last_thunder_at, classes(name, coach_id, condo_id, condos(name, contact_phone))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sessionData) {
    notFound();
  }
  const session = sessionData as unknown as {
    id: string;
    starts_at: string;
    status: string;
    class_id: string;
    ends_at: string;
    is_make_up: boolean;
    cancel_reason: string | null;
    rain_stopped: boolean;
    hold_started_at: string | null;
    last_thunder_at: string | null;
    classes: { name: string; condo_id: string; condos: { name: string; contact_phone: string | null } | null } | null;
  };

  const now = await requestTime();
  const running = now >= new Date(session.starts_at).getTime() && now < new Date(session.ends_at).getTime();

  const { data: enrolData } = await supabase
    .from("class_enrolments")
    .select(
      "student_id, students(full_name, date_of_birth, medical_notes, allergies, emergency_contact_name, emergency_contact_phone)",
    )
    .eq("class_id", session.class_id)
    .order("student_id");
  let enrolled = (enrolData ?? []) as unknown as Enrolled[];
  if (session.is_make_up) {
    // A make-up lesson is only for the students who booked a token into it.
    const { data: bookedData } = await supabase
      .from("make_up_tokens")
      .select("student_id")
      .eq("make_up_session_id", id);
    const booked = new Set(((bookedData ?? []) as { student_id: string }[]).map((row) => row.student_id));
    enrolled = enrolled.filter((row) => booked.has(row.student_id));
  }

  const { count: openTokenCount } = await supabase
    .from("make_up_tokens")
    .select("id", { count: "exact", head: true })
    .eq("source_session_id", id)
    .eq("status", "open");
  const openTokens = openTokenCount ?? 0;
  const { data: proposeData } = await supabase.rpc("staff_setting", { p_key: "coach_propose_make_up" });
  const proposeAllowed = Number(proposeData) === 1;

  const { data: marksData } = await supabase
    .from("attendance")
    .select("student_id, status, reason, excused")
    .eq("session_id", id);
  const marks = new Map(
    ((marksData ?? []) as { student_id: string; status: string; reason: string | null; excused: boolean }[]).map((row) => [
      row.student_id,
      row,
    ]),
  );

  // Coaches see the payment status only: Paid, Due soon or Overdue.
  const paymentStatus = new Map<string, string | null>();
  for (const row of enrolled) {
    const { data } = await supabase.rpc("student_payment_status", { p_student_id: row.student_id });
    paymentStatus.set(row.student_id, (data as string | null) ?? null);
  }

  const condoPhone = session.classes?.condos?.contact_phone ?? null;

  const attendanceStudents = enrolled.map((row) => {
    const mark = marks.get(row.student_id);
    const status = paymentStatus.get(row.student_id);
    return {
      id: row.student_id,
      name: row.students?.full_name ?? "student",
      age: row.students ? String(ageFrom(row.students.date_of_birth)) : "-",
      medicalNotes: row.students?.medical_notes ?? "",
      allergies: row.students?.allergies ?? "",
      emergencyName: row.students?.emergency_contact_name ?? "",
      emergencyPhone: row.students?.emergency_contact_phone ?? null,
      condoPhone,
      paymentLabel: paymentLabel(status),
      status: mark?.status ?? "",
      reason: mark?.reason ?? "",
      excused: mark?.excused ?? false,
    };
  });

  const { data: classRow } = await supabase
    .from("classes")
    .select("level_id")
    .eq("id", (sessionData as unknown as { class_id: string }).class_id)
    .single();
  const { data: skillData } = await supabase
    .from("skills")
    .select("id, name")
    .eq("level_id", classRow?.level_id ?? "00000000-0000-0000-0000-000000000000")
    .eq("is_active", true)
    .order("sort_order");
  const skills = (skillData ?? []) as { id: string; name: string }[];
  const { data: levelData } = await supabase.from("levels").select("id, name").eq("is_active", true).order("sort_order");
  const levels = (levelData ?? []) as { id: string; name: string }[];

  const { data: reportData } = await supabase
    .from("reports")
    .select("id, student_id, attitude, effort, water_confidence, improvements, problems, note_to_parent, next_focus_skill_id")
    .eq("session_id", id);
  const reports = (reportData ?? []) as {
    id: string;
    student_id: string;
    attitude: number | null;
    effort: number | null;
    water_confidence: number | null;
    improvements: string | null;
    problems: string[];
    note_to_parent: string | null;
    next_focus_skill_id: string | null;
  }[];
  const reportIds = reports.map((r) => r.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const reportByStudent = new Map(reports.map((r) => [r.student_id, r]));
  const { data: skillRows } = await supabase
    .from("report_skills")
    .select("report_id, skill_id, progress_percent")
    .in("report_id", reportIds.length ? reportIds : none);
  const progressByReport = new Map<string, Map<string, number>>();
  for (const row of (skillRows ?? []) as { report_id: string; skill_id: string; progress_percent: number }[]) {
    const map = progressByReport.get(row.report_id) ?? new Map<string, number>();
    map.set(row.skill_id, row.progress_percent);
    progressByReport.set(row.report_id, map);
  }
  const { data: noteRows } = await supabase
    .from("report_internal_notes")
    .select("report_id, note")
    .in("report_id", reportIds.length ? reportIds : none);
  const noteByReport = new Map(((noteRows ?? []) as { report_id: string; note: string }[]).map((n) => [n.report_id, n.note]));

  const reportStudents = enrolled.map((row) => {
    const report = reportByStudent.get(row.student_id);
    const progress = report ? progressByReport.get(report.id) ?? new Map<string, number>() : new Map<string, number>();
    return {
      id: row.student_id,
      name: row.students?.full_name ?? "student",
      attitude: report?.attitude ? String(report.attitude) : "",
      effort: report?.effort ? String(report.effort) : "",
      water: report?.water_confidence ? String(report.water_confidence) : "",
      improvements: report?.improvements ?? "",
      note: report?.note_to_parent ?? "",
      internal: report ? noteByReport.get(report.id) ?? "" : "",
      next: report?.next_focus_skill_id ?? "",
      move: "",
      problems: report?.problems ?? [],
      progress: Object.fromEntries([...progress.entries()].map(([skillId, value]) => [skillId, String(value)])),
    };
  });

  return (
    <>
      <p>
        {session.classes?.name} — {new Date(session.starts_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}{" "}
        — {session.status}
        {session.is_make_up && " (make-up lesson)"}
      </p>
      {saved && <p role="status">Attendance saved.</p>}
      {reports_saved && <p role="status">Reports saved.</p>}
      {rain && rainResults[rain] && <p role="status">{rainResults[rain]}</p>}
      {error && <p role="alert">{error}</p>}

      {session.status === "cancelled" && openTokens > 0 && (canManageCondos(me.role) || proposeAllowed) && (
        <>
          <h2>Make-up time</h2>
          <form action={proposeMakeUp}>
            <input type="hidden" name="session_id" value={id} />
            <input type="hidden" name="class_id" value={session.class_id} />
            <label>
              Time for the make-up lesson (Malaysia)
              <input type="datetime-local" name="manual_time" required />
            </label>
            <button type="submit">Book make-up time</button>
          </form>
        </>
      )}

      <h2>Weather</h2>
      {session.status === "scheduled" && running && (
        <form action={startWeatherHold}>
          <input type="hidden" name="session_id" value={id} />
          <button type="submit">Weather hold</button>
        </form>
      )}
      {session.status === "scheduled" && !running && <p>A weather hold can be placed while the lesson is running.</p>}
      {session.status === "paused" && (
        <>
          <p>
            Paused for thunder since {timeInMalaysia(session.hold_started_at ?? session.starts_at)}. Last thunder:{" "}
            {timeInMalaysia(session.last_thunder_at ?? session.hold_started_at ?? session.starts_at)}.
          </p>
          <form action={recordThunder} style={{ display: "inline" }}>
            <input type="hidden" name="session_id" value={id} />
            <button type="submit">Thunder heard</button>
          </form>{" "}
          <form action={resumeWeatherHold} style={{ display: "inline" }}>
            <input type="hidden" name="session_id" value={id} />
            <button type="submit">Resume class</button>
          </form>{" "}
          <form action={cancelWeatherHold} style={{ display: "inline" }}>
            <input type="hidden" name="session_id" value={id} />
            <button type="submit">Cancel class</button>
          </form>
        </>
      )}
      {session.status === "cancelled" && <p>Cancelled{session.cancel_reason ? `: ${session.cancel_reason}` : ""}.</p>}
      {session.status === "done" && session.rain_stopped && <p>Stopped for rain and counted as a session.</p>}

      {enrolled.length === 0 ? (
        <p>No students enrolled in this class.</p>
      ) : (
        <AttendanceForm sessionId={id} students={attendanceStudents} />
      )}

      <h2>Daily reports</h2>
      {enrolled.length > 0 && (
        <ReportsForm sessionId={id} students={reportStudents} skills={skills} levels={levels} />
      )}
    </>
  );
}

export default function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; reports_saved?: string; rain?: string }>;
}) {
  return (
    <main>
      <h1>Lesson attendance</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <SessionAttendance params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
