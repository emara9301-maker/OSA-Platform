"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export async function scheduleMakeUp(formData: FormData) {
  const classId = String(formData.get("class_id") ?? "");
  const tokenIds = formData.getAll("token_id").map(String);
  const manual = String(formData.get("manual_time") ?? "").trim();
  const slot = String(formData.get("slot") ?? "").trim();

  // The manual time is entered in Malaysian time.
  const startsAt = manual ? new Date(`${manual}:00+08:00`) : new Date(slot);
  if (Number.isNaN(startsAt.getTime())) {
    redirect(`/operations?error=${encodeURIComponent("Choose a time for the make-up lesson.")}`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("schedule_make_up", {
    p_class_id: classId,
    p_starts_at: startsAt.toISOString(),
    p_token_ids: tokenIds,
    p_ops_approved: formData.get("ops_approved") === "on",
  });
  if (error) {
    redirect(`/operations?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/operations");
  revalidatePath("/schedule");
  redirect("/operations?saved=1");
}

export async function resolveAlert(formData: FormData) {
  const alertId = String(formData.get("alert_id") ?? "");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("resolve_alert", { p_alert_id: alertId });
  if (error) {
    redirect(`/operations?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/operations");
  redirect("/operations?saved=alert");
}
