"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

const statuses = ["present", "late", "absent"] as const;

// Fields: "status_<studentId>" (blank means not marked) and "reason_<studentId>".
export async function saveAttendance(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  const supabase = await createServerSupabase();

  const rows: { session_id: string; student_id: string; status: string; reason: string | null }[] = [];
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
    rows.push({ session_id: sessionId, student_id: studentId, status, reason: reason === "" ? null : reason });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "session_id,student_id" });
    if (error) {
      redirect(`/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}?saved=1`);
}
