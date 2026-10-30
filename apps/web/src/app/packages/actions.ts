"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PackageInput } from "@/lib/packages";
import { createServerSupabase } from "@/lib/supabase-server";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const maxImageBytes = 5 * 1024 * 1024;

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

function number(formData: FormData, name: string): number | null {
  const value = text(formData, name);
  return value === null ? null : Number(value);
}

function readInput(formData: FormData): PackageInput {
  return {
    pool_id: text(formData, "pool_id"),
    condo_id: null,
    name: text(formData, "name") ?? "",
    short_pitch: text(formData, "short_pitch"),
    age_min: number(formData, "age_min"),
    age_max: number(formData, "age_max"),
    level_range: text(formData, "level_range"),
    type: (text(formData, "type") ?? "private_1_1") as PackageInput["type"],
    sessions_count: number(formData, "sessions_count") ?? 0,
    validity_days: number(formData, "validity_days") ?? 30,
    session_minutes: number(formData, "session_minutes") ?? 0,
    price: number(formData, "price"),
    badge: text(formData, "badge") as PackageInput["badge"],
    image_url: text(formData, "current_image_url"),
    is_active: formData.get("is_active") === "on",
  };
}

// Returns the public URL of the uploaded image, or null when no file was chosen.
// Throws a message the user can read when the file is not a usable image.
async function uploadImage(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  file: File,
): Promise<string> {
  const extension = imageTypes[file.type];
  if (!extension) {
    throw new Error("The image must be a JPG, PNG or WebP file.");
  }
  if (file.size > maxImageBytes) {
    throw new Error("The image must be 5 MB or smaller.");
  }

  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("package-images").upload(path, file, {
    contentType: file.type,
  });
  if (error) {
    throw new Error(error.message);
  }
  return supabase.storage.from("package-images").getPublicUrl(path).data.publicUrl;
}

export async function deletePackage(formData: FormData) {
  const id = text(formData, "id");
  if (!id) {
    redirect("/packages");
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) {
    redirect(`/packages/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/packages");
  redirect("/packages");
}

export async function savePackage(formData: FormData) {
  const id = text(formData, "id");
  const input = readInput(formData);
  const supabase = await createServerSupabase();

  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      input.image_url = await uploadImage(supabase, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload the image.";
      redirect(`${id ? `/packages/${id}` : "/packages/new"}?error=${encodeURIComponent(message)}`);
    }
  }

  if (id) {
    const { error } = await supabase.from("packages").update(input).eq("id", id);
    if (error) {
      redirect(`/packages/${id}?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath("/packages");
    redirect(`/packages/${id}`);
  }

  const { error } = await supabase.from("packages").insert(input);
  if (error) {
    redirect(`/packages/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/packages");
  redirect("/packages");
}
