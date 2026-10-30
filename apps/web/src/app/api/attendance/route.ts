import { NextResponse } from "next/server";
import { saveAttendanceRows, type AttendanceRow } from "@/lib/attendance-save";
import { createServerSupabase } from "@/lib/supabase-server";

const statuses = ["present", "late", "absent"];

// Saves attendance sent from the coach app, including records taken offline and sent later.
// Body: { session_id: string, rows: AttendanceRow[] }. The signed-in coach's own rights apply.
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Sign in again to send attendance." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { session_id?: unknown; rows?: unknown } | null;
  if (!body || typeof body.session_id !== "string" || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Attendance could not be read." }, { status: 400 });
  }

  const rows: AttendanceRow[] = [];
  for (const row of body.rows as Partial<AttendanceRow>[]) {
    if (typeof row.student_id !== "string" || typeof row.status !== "string" || !statuses.includes(row.status)) {
      return NextResponse.json({ error: "A record has an unknown status." }, { status: 400 });
    }
    const reason = typeof row.reason === "string" && row.reason.trim() !== "" ? row.reason.trim() : null;
    if (row.status === "absent" && reason === null) {
      return NextResponse.json({ error: "A reason is needed when a student is absent." }, { status: 400 });
    }
    rows.push({
      student_id: row.student_id,
      status: row.status as AttendanceRow["status"],
      reason,
      excused: row.status === "absent" && row.excused === true,
    });
  }

  try {
    const result = await saveAttendanceRows(supabase, body.session_id, rows);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save." }, { status: 400 });
  }
}
