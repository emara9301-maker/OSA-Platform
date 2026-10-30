"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

function number(formData: FormData, name: string): number {
  return Number(text(formData, name) ?? 0);
}

export async function saveClass(formData: FormData) {
  const id = text(formData, "id");
  const input = {
    name: text(formData, "name") ?? "",
    condo_id: text(formData, "condo_id") ?? "",
    pool_id: text(formData, "pool_id"),
    coach_id: text(formData, "coach_id") ?? "",
    level_id: text(formData, "level_id") ?? "",
    class_type: text(formData, "class_type") ?? "group",
    weekday: number(formData, "weekday"),
    start_time: text(formData, "start_time") ?? "",
    duration_minutes: number(formData, "duration_minutes"),
    capacity: number(formData, "capacity"),
    start_date: text(formData, "start_date") ?? "",
    end_date: text(formData, "end_date") ?? "",
  };
  const supabase = await createServerSupabase();

  // The pool must belong to the chosen condo.
  if (input.pool_id) {
    const { data: pool } = await supabase.from("pools").select("condo_id").eq("id", input.pool_id).maybeSingle();
    if (pool?.condo_id !== input.condo_id) {
      const back = id ? `/classes/${id}` : "/classes/new";
      redirect(`${back}?error=${encodeURIComponent("The pool must belong to the chosen condo.")}`);
    }
  }

  if (id) {
    const { error } = await supabase.from("classes").update(input).eq("id", id);
    if (error) {
      redirect(`/classes/${id}?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath("/classes");
    redirect(`/classes/${id}`);
  }

  const { data, error } = await supabase.from("classes").insert(input).select("id").single();
  if (error) {
    redirect(`/classes/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/classes");
  redirect(`/classes/${data.id}`);
}

export async function enrolStudent(formData: FormData) {
  const classId = text(formData, "class_id") ?? "";
  const studentId = text(formData, "student_id") ?? "";
  const supabase = await createServerSupabase();

  const { error } = await supabase.from("class_enrolments").insert({ class_id: classId, student_id: studentId });
  if (error) {
    redirect(`/classes/${classId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/classes/${classId}`);
  redirect(`/classes/${classId}`);
}

export async function unenrolStudent(formData: FormData) {
  const classId = text(formData, "class_id") ?? "";
  const studentId = text(formData, "student_id") ?? "";
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("class_enrolments")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) {
    redirect(`/classes/${classId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/classes/${classId}`);
  redirect(`/classes/${classId}`);
}

// Cancelling issues make-up tokens to every enrolled student, so it goes through the server function.
export async function cancelSession(formData: FormData) {
  const classId = text(formData, "class_id") ?? "";
  const sessionId = text(formData, "session_id") ?? "";
  const kind = text(formData, "kind") ?? "holiday";
  const reason = text(formData, "reason");
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_session_for_reason", {
    p_session_id: sessionId,
    p_kind: kind,
    p_reason: reason,
  });
  if (error) {
    redirect(`/classes/${classId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/schedule");
  redirect(`/classes/${classId}`);
}
