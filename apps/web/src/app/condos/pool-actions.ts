"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uploadPoolPhoto } from "@/lib/uploads";
import { createServerSupabase } from "@/lib/supabase-server";

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

// A pool can be removed only when nothing uses it: its packages, classes and students must be moved or removed first.
function inUseMessage(message: string): string {
  return message.includes("violates foreign key")
    ? "This pool still has packages, classes or students. Move or remove them first."
    : message;
}

async function photoFor(supabase: Awaited<ReturnType<typeof createServerSupabase>>, formData: FormData, fallback: string | null, failPath: string) {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      return await uploadPoolPhoto(supabase, file);
    } catch (error) {
      redirect(`${failPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not upload the photo.")}`);
    }
  }
  return fallback;
}

// Fields: "condo_id", "name", "pool_hours", "rules", "access_notes", optional "image".
export async function addPool(formData: FormData) {
  const condoId = String(formData.get("condo_id") ?? "");
  const supabase = await createServerSupabase();
  const name = text(formData, "name");
  if (!name) {
    redirect(`/condos/${condoId}?error=${encodeURIComponent("A pool needs a name.")}`);
  }
  const image = await photoFor(supabase, formData, null, `/condos/${condoId}`);

  const { data: last } = await supabase
    .from("pools")
    .select("sort_order")
    .eq("condo_id", condoId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("pools").insert({
    condo_id: condoId,
    name,
    pool_hours: text(formData, "pool_hours"),
    rules: text(formData, "rules"),
    access_notes: text(formData, "access_notes"),
    image_url: image,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) {
    redirect(`/condos/${condoId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/condos/${condoId}`);
  redirect(`/condos/${condoId}?saved=pool`);
}

// Fields: "id", "condo_id", "name", "pool_hours", "rules", "access_notes", "current_image_url", optional "image".
export async function savePool(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const condoId = String(formData.get("condo_id") ?? "");
  const failPath = `/condos/${condoId}/pools/${id}`;
  const supabase = await createServerSupabase();
  const name = text(formData, "name");
  if (!name) {
    redirect(`${failPath}?error=${encodeURIComponent("A pool needs a name.")}`);
  }
  const image = await photoFor(supabase, formData, text(formData, "current_image_url"), failPath);

  const { error } = await supabase
    .from("pools")
    .update({
      name,
      pool_hours: text(formData, "pool_hours"),
      rules: text(formData, "rules"),
      access_notes: text(formData, "access_notes"),
      image_url: image,
    })
    .eq("id", id);
  if (error) {
    redirect(`${failPath}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/condos/${condoId}`);
  redirect(`${failPath}?saved=1`);
}

// Fields: "id", "condo_id".
export async function removePool(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const condoId = String(formData.get("condo_id") ?? "");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("pools").delete().eq("id", id);
  if (error) {
    redirect(`/condos/${condoId}?error=${encodeURIComponent(inUseMessage(error.message))}`);
  }
  revalidatePath(`/condos/${condoId}`);
  redirect(`/condos/${condoId}?saved=removed`);
}
