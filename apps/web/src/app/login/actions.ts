"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

// Where to go after signing in: the page the visitor came from, if it is a page of this site.
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createServerSupabase();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
