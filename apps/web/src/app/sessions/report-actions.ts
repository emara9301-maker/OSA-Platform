"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { problemKeys, saveReportRows, type ReportRow } from "@/lib/report-save";
import { createServerSupabase } from "@/lib/supabase-server";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// Fields are named per student: attitude_<id>, effort_<id>, water_<id>, improvements_<id>, note_<id>,
// internal_<id>, next_<id>, move_<id>, problem_<id>_<key>, skill_<id>_<skillId>.
export async function saveReports(formData: FormData) {
  const sessionId = value(formData, "session_id");
  const supabase = await createServerSupabase();

  const { data: session } = await supabase.from("sessions").select("class_id").eq("id", sessionId).maybeSingle();
  if (!session) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent("This lesson could not be found.")}`);
  }
  const { data: enrolled } = await supabase
    .from("class_enrolments")
    .select("student_id")
    .eq("class_id", (session as { class_id: string }).class_id);

  const rows: ReportRow[] = [];
  for (const row of (enrolled ?? []) as { student_id: string }[]) {
    const id = row.student_id;
    const skills: { skill_id: string; progress_percent: number }[] = [];
    for (const [name, raw] of formData.entries()) {
      if (name.startsWith(`skill_${id}_`) && String(raw) !== "") {
        skills.push({ skill_id: name.slice(`skill_${id}_`.length), progress_percent: Number(raw) });
      }
    }
    rows.push({
      student_id: id,
      attitude: value(formData, `attitude_${id}`) ? Number(value(formData, `attitude_${id}`)) : null,
      effort: value(formData, `effort_${id}`) ? Number(value(formData, `effort_${id}`)) : null,
      water_confidence: value(formData, `water_${id}`) ? Number(value(formData, `water_${id}`)) : null,
      improvements: value(formData, `improvements_${id}`),
      note_to_parent: value(formData, `note_${id}`),
      internal: value(formData, `internal_${id}`),
      next_focus_skill_id: value(formData, `next_${id}`),
      move_level_id: value(formData, `move_${id}`),
      problems: problemKeys.filter((key) => formData.get(`problem_${id}_${key}`) === "on"),
      skills,
    });
  }

  try {
    await saveReportRows(supabase, sessionId, rows);
  } catch (error) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save.")}`);
  }

  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}?reports_saved=1`);
}
