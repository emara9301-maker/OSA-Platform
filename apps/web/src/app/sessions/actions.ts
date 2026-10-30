"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveAttendanceRows, type AttendanceRow, type AttendanceStatus } from "@/lib/attendance-save";
import { createServerSupabase } from "@/lib/supabase-server";

const statuses = ["present", "late", "absent"] as const;

// Fields: "status_<studentId>" (blank means not marked), "reason_<studentId>" and "excused_<studentId>".
export async function saveAttendance(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  const supabase = await createServerSupabase();

  const rows: AttendanceRow[] = [];
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("status_")) {
      continue;
    }
    const status = String(raw);
    if (status === "") {
      continue;
    }
    if (!(statuses as readonly string[]).includes(status)) {
      redirect(`/sessions/${sessionId}?error=${encodeURIComponent("Unknown attendance status.")}`);
    }
    const studentId = name.slice("status_".length);
    const reason = String(formData.get(`reason_${studentId}`) ?? "").trim();
    if (status === "absent" && reason === "") {
      redirect(`/sessions/${sessionId}?error=${encodeURIComponent("A reason is needed when a student is absent.")}`);
    }
    // Only an absence can be excused. Other statuses are never excused.
    const excused = status === "absent" && formData.get(`excused_${studentId}`) === "on";
    rows.push({
      student_id: studentId,
      status: status as AttendanceStatus,
      reason: reason === "" ? null : reason,
      excused,
    });
  }

  let result;
  try {
    result = await saveAttendanceRows(supabase, sessionId, rows);
  } catch (error) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save.")}`);
  }

  revalidatePath(`/sessions/${sessionId}`);
  if (result.blocked.length > 0) {
    const { data: names } = await supabase
      .from("students")
      .select("id, full_name")
      .in("id", result.blocked.map((row) => row.studentId));
    const nameOf = new Map(((names ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, row.full_name]));
    const message = result.blocked
      .map((row) => `${nameOf.get(row.studentId) ?? "Student"}: ${row.reason}`)
      .join(" ");
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(`Not marked as attending. ${message}`)}`);
  }
  redirect(`/sessions/${sessionId}?saved=1`);
}
