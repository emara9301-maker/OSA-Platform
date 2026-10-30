import type { SupabaseClient } from "@supabase/supabase-js";

export const problemKeys = ["fear", "behaviour", "health", "missing_gear", "late"] as const;

export type ReportRow = {
  student_id: string;
  attitude: number | null;
  effort: number | null;
  water_confidence: number | null;
  improvements: string;
  note_to_parent: string;
  internal: string;
  next_focus_skill_id: string;
  move_level_id: string;
  problems: string[];
  skills: { skill_id: string; progress_percent: number }[];
};

// Saves the daily reports of one lesson. Used by the lesson page and by the coach app when it sends reports taken offline.
// Only students with something written get a report. A level move is applied after the report.
export async function saveReportRows(client: SupabaseClient, sessionId: string, rows: ReportRow[]): Promise<void> {
  for (const row of rows) {
    const hasReport =
      row.attitude !== null ||
      row.effort !== null ||
      row.water_confidence !== null ||
      row.improvements !== "" ||
      row.note_to_parent !== "" ||
      row.next_focus_skill_id !== "" ||
      row.problems.length > 0 ||
      row.skills.length > 0;

    if (hasReport) {
      const { data: report, error } = await client
        .from("reports")
        .upsert(
          {
            session_id: sessionId,
            student_id: row.student_id,
            attitude: row.attitude,
            effort: row.effort,
            water_confidence: row.water_confidence,
            improvements: row.improvements || null,
            note_to_parent: row.note_to_parent || null,
            problems: row.problems,
            next_focus_skill_id: row.next_focus_skill_id || null,
          },
          { onConflict: "session_id,student_id" },
        )
        .select("id")
        .single();
      if (error || !report) {
        throw new Error(error?.message ?? "The report could not be saved.");
      }

      await client.from("report_skills").delete().eq("report_id", report.id);
      if (row.skills.length > 0) {
        const { error: skillError } = await client
          .from("report_skills")
          .insert(row.skills.map((skill) => ({ ...skill, report_id: report.id })));
        if (skillError) {
          throw new Error(skillError.message);
        }
      }

      if (row.internal) {
        const { error: noteError } = await client
          .from("report_internal_notes")
          .upsert({ report_id: report.id, note: row.internal }, { onConflict: "report_id" });
        if (noteError) {
          throw new Error(noteError.message);
        }
      }
    }

    if (row.move_level_id) {
      const { error: moveError } = await client.rpc("move_student_level", {
        p_session: sessionId,
        p_student: row.student_id,
        p_level_id: row.move_level_id,
      });
      if (moveError) {
        throw new Error(moveError.message);
      }
    }
  }
}
