"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

// Fields: "name".
export async function createFamily(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("create_my_family", { p_name: name });
  if (error) {
    redirect(`/link-child?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/link-child?saved=family");
}

export async function requestLink(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "").trim();
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("request_guardian_link", {
    p_token: token,
    p_relationship: relationship,
  });
  if (error) {
    redirect(`/link-child?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/link-child?sent=1");
}
