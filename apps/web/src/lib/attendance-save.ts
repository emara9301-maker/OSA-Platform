import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendanceStatus = "present" | "late" | "absent";

export type AttendanceRow = {
  student_id: string;
  status: AttendanceStatus;
  reason: string | null;
  excused: boolean;
};

export type SaveResult = {
  saved: number;
  blocked: { studentId: string; reason: string }[];
};

const attended = (status: string) => status === "present" || status === "late";

// Saves attendance for one lesson. A student with no sessions left, or on hold, is not marked as attending,
// and the reason is returned. Everyone else is saved. The same rule runs again in the database.
export async function saveAttendanceRows(client: SupabaseClient, sessionId: string, rows: AttendanceRow[]): Promise<SaveResult> {
  const blocked: SaveResult["blocked"] = [];
  const allowed: (AttendanceRow & { session_id: string })[] = [];

  for (const row of rows) {
    if (attended(row.status)) {
      const { data: reason } = await client.rpc("attendance_block_reason", {
        p_session_id: sessionId,
        p_student_id: row.student_id,
      });
      if (reason) {
        blocked.push({ studentId: row.student_id, reason: String(reason) });
        continue;
      }
    }
    allowed.push({ session_id: sessionId, ...row });
  }

  if (allowed.length > 0) {
    const { error } = await client.from("attendance").upsert(allowed, { onConflict: "session_id,student_id" });
    if (error) {
      throw new Error(error.message);
    }
  }
  return { saved: allowed.length, blocked };
}
