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

// Adds a level at the end of the list. Only managers may add one, and the audit log records it.
export async function addLevel(formData: FormData) {
  const name = String(formData.get("new_level") ?? "").trim();
  if (name === "") {
    redirect(`/settings?error=${encodeURIComponent("A level needs a name.")}`);
  }
  const supabase = await createServerSupabase();

  const { data: last } = await supabase
    .from("levels")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("levels")
    .insert({ name, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?saved=level");
}

// Ends a family's package pause. Fields: "pause_id".
export async function cancelPause(formData: FormData) {
  const pauseId = String(formData.get("pause_id") ?? "");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_pause", { p_pause_id: pauseId });
  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/settings");
  redirect("/settings?saved=pause");
}

// Which standard pool details visitors see, and what they are called. Fields: "show_<key>" and "label_<key>".
export async function savePoolFields(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: fields } = await supabase.from("pool_fields").select("key, label");
  for (const field of (fields ?? []) as { key: string; label: string }[]) {
    const label = String(formData.get(`label_${field.key}`) ?? "").trim();
    const { error } = await supabase
      .from("pool_fields")
      .update({ visible: formData.get(`show_${field.key}`) === "on", label: label === "" ? field.label : label })
      .eq("key", field.key);
    if (error) {
      redirect(`/settings?error=${encodeURIComponent(error.message)}`);
    }
  }
  revalidatePath("/settings");
  revalidatePath("/pools");
  redirect("/settings?saved=pools");
}
