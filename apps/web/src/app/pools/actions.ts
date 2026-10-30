"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

// Fields: "pool_id", "class_id", and optionally "student_id" (one of the account's children; empty for the account itself).
export async function joinClass(formData: FormData) {
  const poolId = String(formData.get("pool_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "") || null;
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("join_class", { p_class_id: classId, p_student_id: studentId });
  if (error) {
    redirect(`/pools/${poolId}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/pools/${poolId}?joined=1`);
}
