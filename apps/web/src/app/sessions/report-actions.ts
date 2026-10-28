"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

const problemKeys = ["fear", "behaviour", "health", "missing_gear", "late"] as const;

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// Fields are named per student: attitude_<id>, effort_<id>, water_<id>, improvements_<id>, note_<id>,
// internal_<id>, next_<id>, move_<id>, problem_<id>_<key>, skill_<id>_<skillId>.
export async function saveReports(formData: FormData) {
  const sessionId = value(formData, "session_id");
  const supabase = await createServerSupabase();
  function fail(message: string): never {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(message)}`);
  }

  const { data: session } = await supabase.from("sessions").select("class_id").eq("id", sessionId).maybeSingle();
  if (!session) {
    fail("This lesson could not be found.");
  }
  const { data: enrolled } = await supabase
    .from("class_enrolments")
    .select("student_id")
    .eq("class_id", (session as { class_id: string }).class_id);

  for (const row of (enrolled ?? []) as { student_id: string }[]) {
    const id = row.student_id;
    const attitude = value(formData, `attitude_${id}`);
    const effort = value(formData, `effort_${id}`);
    const water = value(formData, `water_${id}`);
    const improvements = value(formData, `improvements_${id}`);
    const note = value(formData, `note_${id}`);
    const internal = value(formData, `internal_${id}`);
    const next = value(formData, `next_${id}`);
    const move = value(formData, `move_${id}`);
    const problems = problemKeys.filter((key) => formData.get(`problem_${id}_${key}`) === "on");
    const skills: { skill_id: string; progress_percent: number }[] = [];
    for (const [name, raw] of formData.entries()) {
      if (name.startsWith(`skill_${id}_`) && String(raw) !== "") {
        skills.push({ skill_id: name.slice(`skill_${id}_`.length), progress_percent: Number(raw) });
      }
    }

    const hasReport =
      attitude || effort || water || improvements || note || next || problems.length > 0 || skills.length > 0;

    if (hasReport) {
      const { data: report, error } = await supabase
        .from("reports")
        .upsert(
          {
            session_id: sessionId,
            student_id: id,
            attitude: attitude ? Number(attitude) : null,
            effort: effort ? Number(effort) : null,
            water_confidence: water ? Number(water) : null,
            improvements: improvements || null,
            note_to_parent: note || null,
            problems,
            next_focus_skill_id: next || null,
          },
          { onConflict: "session_id,student_id" },
        )
        .select("id")
        .single();
      if (error || !report) {
        fail(error?.message ?? "The report could not be saved.");
      }

      await supabase.from("report_skills").delete().eq("report_id", report.id);
      if (skills.length > 0) {
        const { error: skillError } = await supabase
          .from("report_skills")
          .insert(skills.map((skill) => ({ ...skill, report_id: report.id })));
        if (skillError) {
          fail(skillError.message);
        }
      }

      if (internal) {
        const { error: noteError } = await supabase
          .from("report_internal_notes")
          .upsert({ report_id: report.id, note: internal }, { onConflict: "report_id" });
        if (noteError) {
          fail(noteError.message);
        }
      }
    }

    if (move) {
      const { error: moveError } = await supabase.rpc("move_student_level", {
        p_session: sessionId,
        p_student: id,
        p_level_id: move,
      });
      if (moveError) {
        fail(moveError.message);
      }
    }
  }

  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}?reports_saved=1`);
}
