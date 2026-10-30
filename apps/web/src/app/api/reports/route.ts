import { NextResponse } from "next/server";
import { problemKeys, saveReportRows, type ReportRow } from "@/lib/report-save";
import { createServerSupabase } from "@/lib/supabase-server";

const isRating = (value: unknown) => value === null || (typeof value === "number" && value >= 1 && value <= 5);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// Saves daily reports sent from the coach app, including reports written offline and sent later.
// Body: { session_id: string, rows: ReportRow[] }. The signed-in coach's own rights apply.
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Sign in again to send reports." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { session_id?: unknown; rows?: unknown } | null;
  if (!body || typeof body.session_id !== "string" || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Reports could not be read." }, { status: 400 });
  }

  const rows: ReportRow[] = [];
  for (const raw of body.rows as Record<string, unknown>[]) {
    if (typeof raw.student_id !== "string" || !isRating(raw.attitude) || !isRating(raw.effort) || !isRating(raw.water_confidence)) {
      return NextResponse.json({ error: "A report has a value that is not allowed." }, { status: 400 });
    }
    const problems = Array.isArray(raw.problems) ? raw.problems.filter((p): p is string => typeof p === "string") : [];
    if (problems.some((p) => !(problemKeys as readonly string[]).includes(p))) {
      return NextResponse.json({ error: "A problem is not on the list." }, { status: 400 });
    }
    const skills = Array.isArray(raw.skills)
      ? (raw.skills as { skill_id?: unknown; progress_percent?: unknown }[]).filter(
          (s) => typeof s.skill_id === "string" && typeof s.progress_percent === "number",
        ).map((s) => ({ skill_id: s.skill_id as string, progress_percent: s.progress_percent as number }))
      : [];
    rows.push({
      student_id: raw.student_id,
      attitude: (raw.attitude as number | null) ?? null,
      effort: (raw.effort as number | null) ?? null,
      water_confidence: (raw.water_confidence as number | null) ?? null,
      improvements: text(raw.improvements),
      note_to_parent: text(raw.note_to_parent),
      internal: text(raw.internal),
      next_focus_skill_id: text(raw.next_focus_skill_id),
      move_level_id: text(raw.move_level_id),
      problems,
      skills,
    });
  }

  try {
    await saveReportRows(supabase, body.session_id, rows);
    return NextResponse.json({ saved: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save." }, { status: 400 });
  }
}
