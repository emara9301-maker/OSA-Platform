"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export async function decideLink(formData: FormData) {
  const requestId = String(formData.get("request_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("decide_guardian_link", {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) {
    redirect(`/link-requests?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/link-requests");
  revalidatePath("/dashboard");
  redirect("/link-requests");
}
