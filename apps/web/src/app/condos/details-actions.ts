"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

function back(condoId: string, message: string): never {
  redirect(`/condos/${condoId}?error=${encodeURIComponent(message)}`);
}

// Adds an extra detail to a pool, shown to visitors unless it is hidden. Fields: "condo_id", "label", "value".
export async function addPoolDetail(formData: FormData) {
  const condoId = String(formData.get("condo_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (label === "" || value === "") {
    back(condoId, "A detail needs a name and a value.");
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("condo_details").insert({ condo_id: condoId, label, value });
  if (error) {
    back(condoId, error.message);
  }
  revalidatePath(`/condos/${condoId}`);
  redirect(`/condos/${condoId}?saved=detail`);
}

// Shows or hides an extra detail. Fields: "id", "condo_id", "visible" ("1" or "0").
export async function togglePoolDetail(formData: FormData) {
  const condoId = String(formData.get("condo_id") ?? "");
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("condo_details")
    .update({ visible: formData.get("visible") !== "1" })
    .eq("id", String(formData.get("id") ?? ""));
  if (error) {
    back(condoId, error.message);
  }
  revalidatePath(`/condos/${condoId}`);
  redirect(`/condos/${condoId}?saved=detail`);
}

// Deletes an extra detail. Fields: "id", "condo_id".
export async function removePoolDetail(formData: FormData) {
  const condoId = String(formData.get("condo_id") ?? "");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("condo_details").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) {
    back(condoId, error.message);
  }
  revalidatePath(`/condos/${condoId}`);
  redirect(`/condos/${condoId}?saved=detail`);
}
