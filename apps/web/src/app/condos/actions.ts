"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CondoInput } from "@/lib/condos";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

function number(formData: FormData, name: string): number | null {
  const value = text(formData, name);
  return value === null ? null : Number(value);
}

function readInput(formData: FormData): CondoInput {
  return {
    name: text(formData, "name") ?? "",
    area: text(formData, "area"),
    address: text(formData, "address"),
    latitude: number(formData, "latitude"),
    longitude: number(formData, "longitude"),
    pool_hours: text(formData, "pool_hours"),
    rules: text(formData, "rules"),
    access_notes: text(formData, "access_notes"),
    contact_phone: text(formData, "contact_phone"),
  };
}

export async function saveCondo(formData: FormData) {
  const id = text(formData, "id");
  const input = readInput(formData);
  const supabase = await createServerSupabase();

  if (id) {
    const { error } = await supabase.from("condos").update(input).eq("id", id);
    if (error) {
      redirect(`/condos/${id}?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath("/condos");
    redirect(`/condos/${id}`);
  }

  const { error } = await supabase.from("condos").insert(input);
  if (error) {
    redirect(`/condos/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/condos");
  redirect("/condos");
}

export async function deleteCondo(formData: FormData) {
  const id = text(formData, "id");
  if (!id) {
    redirect("/condos");
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("condos").delete().eq("id", id);
  if (error) {
    redirect(`/condos/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/condos");
  redirect("/condos");
}
