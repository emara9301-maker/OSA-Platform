"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

// Level names and whether each level is offered. Fields: "level_<id>" and "active_<id>".
export async function saveLevels(formData: FormData) {
  const supabase = await createServerSupabase();

  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("level_")) {
      continue;
    }
    const id = name.slice("level_".length);
    const levelName = String(raw).trim();
    if (levelName === "") {
      redirect(`/settings?error=${encodeURIComponent("A level needs a name.")}`);
    }
    const isActive = formData.get(`active_${id}`) === "on";
    const { error } = await supabase.from("levels").update({ name: levelName, is_active: isActive }).eq("id", id);
    if (error) {
      redirect(`/settings?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

// Each field is named "setting_<key>". Only fields that start with that prefix are saved.
export async function saveSettings(formData: FormData) {
  const supabase = await createServerSupabase();

  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("setting_")) {
      continue;
    }
    const value = Number(String(raw).trim());
    if (String(raw).trim() === "" || Number.isNaN(value) || value < 0) {
      redirect(`/settings?error=${encodeURIComponent("Every setting must be a number, zero or more.")}`);
    }

    const key = name.slice("setting_".length);
    const { error } = await supabase.from("settings").update({ value }).eq("key", key);
    if (error) {
      redirect(`/settings?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
