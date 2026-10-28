"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

function readStudent(formData: FormData) {
  const dataConsent = formData.get("data_consent") === "on";
  return {
    full_name: text(formData, "full_name") ?? "",
    nickname: text(formData, "nickname"),
    date_of_birth: text(formData, "date_of_birth") ?? "",
    language: text(formData, "language"),
    condo_id: text(formData, "condo_id") ?? "",
    family_id: text(formData, "family_id"),
    status: text(formData, "status") ?? "lead",
    start_level: text(formData, "start_level"),
    current_level: text(formData, "current_level"),
    start_date: text(formData, "start_date"),
    medical_notes: text(formData, "medical_notes"),
    allergies: text(formData, "allergies"),
    emergency_contact_name: text(formData, "emergency_contact_name"),
    emergency_contact_phone: text(formData, "emergency_contact_phone"),
    photo_consent: formData.get("photo_consent") === "on",
    data_consent: dataConsent,
    consents_accepted_at: dataConsent ? new Date().toISOString() : null,
  };
}

export async function saveStudent(formData: FormData) {
  const id = text(formData, "id");
  const input = readStudent(formData);
  const supabase = await createServerSupabase();

  if (id) {
    const { error } = await supabase.from("students").update(input).eq("id", id);
    if (error) {
      redirect(`/students/${id}?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath("/students");
    redirect(`/students/${id}`);
  }

  const { data, error } = await supabase.from("students").insert(input).select("id").single();
  if (error) {
    redirect(`/students/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/students");
  redirect(`/students/${data.id}`);
}

export async function assignCoach(formData: FormData) {
  const studentId = text(formData, "student_id") ?? "";
  const coachId = text(formData, "coach_id") ?? "";
  const supabase = await createServerSupabase();

  const { error } = await supabase.from("student_coaches").insert({ student_id: studentId, coach_id: coachId });
  if (error) {
    redirect(`/students/${studentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
}

export async function unassignCoach(formData: FormData) {
  const studentId = text(formData, "student_id") ?? "";
  const coachId = text(formData, "coach_id") ?? "";
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("student_coaches")
    .delete()
    .eq("student_id", studentId)
    .eq("coach_id", coachId);
  if (error) {
    redirect(`/students/${studentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
}

// Links an adult student's own login to their student record. An empty choice unlinks it.
export async function linkAccount(formData: FormData) {
  const studentId = text(formData, "student_id") ?? "";
  const accountId = text(formData, "account_id");
  const supabase = await createServerSupabase();

  const { error } = await supabase.from("students").update({ account_id: accountId }).eq("id", studentId);
  if (error) {
    redirect(`/students/${studentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
}
