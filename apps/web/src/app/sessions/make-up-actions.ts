"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

// A coach (when the setting allows) or a manager books a make-up time for a cancelled lesson's open tokens.
// Fields: "session_id", "class_id", "manual_time" (Malaysian time, from a datetime field).
export async function proposeMakeUp(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const manual = String(formData.get("manual_time") ?? "").trim();
  const startsAt = new Date(`${manual}:00+08:00`);
  if (manual === "" || Number.isNaN(startsAt.getTime())) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent("Choose a time for the make-up lesson.")}`);
  }

  const supabase = await createServerSupabase();
  const { data: tokens } = await supabase
    .from("make_up_tokens")
    .select("id")
    .eq("source_session_id", sessionId)
    .eq("status", "open");
  const tokenIds = (tokens ?? []).map((row) => row.id as string);

  const { error } = await supabase.rpc("schedule_make_up", {
    p_class_id: classId,
    p_starts_at: startsAt.toISOString(),
    p_token_ids: tokenIds,
  });
  if (error) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/operations");
  redirect(`/sessions/${sessionId}?rain=made`);
}
