"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

export async function createIncident(formData: FormData) {
  const supabase = await createServerSupabase();
  const occurredAt = text(formData, "occurred_at");
  const informedAt = text(formData, "informed_at");
  const { error } = await supabase.from("incidents").insert({
    condo_id: text(formData, "condo_id") ?? "",
    student_id: text(formData, "student_id"),
    occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    incident_type: text(formData, "incident_type") ?? "other",
    severity: text(formData, "severity") ?? "low",
    description: text(formData, "description") ?? "",
    informed_who: text(formData, "informed_who"),
    informed_channel: text(formData, "informed_channel"),
    informed_at: informedAt ? new Date(informedAt).toISOString() : null,
    follow_up: text(formData, "follow_up"),
  });
  if (error) {
    redirect(`/incidents/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/incidents");
  redirect("/incidents");
}

export async function closeIncident(formData: FormData) {
  const id = text(formData, "id") ?? "";
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("incidents").update({ status: "closed" }).eq("id", id);
  if (error) {
    redirect(`/incidents?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/incidents");
  redirect("/incidents");
}
