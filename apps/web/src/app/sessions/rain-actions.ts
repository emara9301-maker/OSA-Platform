"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

// Each action is decided by the server function. The page only shows the result.
async function runRainAction(sessionId: string, fn: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc(fn, { p_session_id: sessionId });
  if (error) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/operations");
  redirect(`/sessions/${sessionId}?rain=${encodeURIComponent(String(data))}`);
}

export async function startWeatherHold(formData: FormData) {
  await runRainAction(String(formData.get("session_id") ?? ""), "start_weather_hold");
}

export async function recordThunder(formData: FormData) {
  await runRainAction(String(formData.get("session_id") ?? ""), "record_thunder");
}

export async function resumeWeatherHold(formData: FormData) {
  await runRainAction(String(formData.get("session_id") ?? ""), "resume_weather_hold");
}

export async function cancelWeatherHold(formData: FormData) {
  await runRainAction(String(formData.get("session_id") ?? ""), "cancel_weather_hold");
}
