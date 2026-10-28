"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

export async function createFamily(formData: FormData) {
  const name = text(formData, "name") ?? "";
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("families").insert({ name }).select("id").single();
  if (error) {
    redirect(`/families/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/families");
  redirect(`/families/${data.id}`);
}

export async function addGuardian(formData: FormData) {
  const familyId = text(formData, "family_id") ?? "";
  const profileId = text(formData, "profile_id") ?? "";
  const relationship = text(formData, "relationship") ?? "";
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("family_guardians")
    .insert({ family_id: familyId, profile_id: profileId, relationship });
  if (error) {
    redirect(`/families/${familyId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/families/${familyId}`);
  redirect(`/families/${familyId}`);
}

export async function removeGuardian(formData: FormData) {
  const familyId = text(formData, "family_id") ?? "";
  const profileId = text(formData, "profile_id") ?? "";
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("family_guardians")
    .delete()
    .eq("family_id", familyId)
    .eq("profile_id", profileId);
  if (error) {
    redirect(`/families/${familyId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/families/${familyId}`);
  redirect(`/families/${familyId}`);
}
