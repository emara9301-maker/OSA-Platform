import type { SupabaseClient } from "@supabase/supabase-js";

// Number of enrolled students with no report for a lesson that has already happened in the last 7 days.
// Row-level security limits the count to the lessons this account may see.
export async function countMissingReports(client: SupabaseClient, days: number): Promise<number> {
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { data: sessions } = await client
    .from("sessions")
    .select("id, class_id")
    .in("status", ["scheduled", "done"])
    .gte("starts_at", since.toISOString())
    .lt("starts_at", now.toISOString());
  const list = (sessions ?? []) as { id: string; class_id: string }[];
  if (list.length === 0) {
    return 0;
  }

  const classIds = [...new Set(list.map((s) => s.class_id))];
  const { data: enrolments } = await client.from("class_enrolments").select("class_id").in("class_id", classIds);
  const enrolledByClass = new Map<string, number>();
  for (const row of (enrolments ?? []) as { class_id: string }[]) {
    enrolledByClass.set(row.class_id, (enrolledByClass.get(row.class_id) ?? 0) + 1);
  }

  const { data: reports } = await client
    .from("reports")
    .select("session_id")
    .in("session_id", list.map((s) => s.id));
  const reportsBySession = new Map<string, number>();
  for (const row of (reports ?? []) as { session_id: string }[]) {
    reportsBySession.set(row.session_id, (reportsBySession.get(row.session_id) ?? 0) + 1);
  }

  let missing = 0;
  for (const session of list) {
    const expected = enrolledByClass.get(session.class_id) ?? 0;
    missing += Math.max(0, expected - (reportsBySession.get(session.id) ?? 0));
  }
  return missing;
}
