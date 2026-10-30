"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { currentLang, type Lang } from "@/lib/i18n";
import { localizeError } from "@/lib/messages";

function fail(lang: Lang, packageId: string, message: string): never {
  redirect(`/buy/${packageId}?error=${encodeURIComponent(localizeError(lang, message))}`);
}

// Fields: "package_id", "pool_id", "student_id" (an existing child, "self" for the account itself, or "new"),
// and for "new" also "new_name" and "new_birth".
export async function buyPackage(formData: FormData) {
  const lang = await currentLang();
  const packageId = String(formData.get("package_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const supabase = await createServerSupabase();

  if (studentId === "") {
    fail(lang, packageId, "Choose who this package is for.");
  }
  let childId = studentId;
  if (childId === "self") {
    const { data, error } = await supabase.rpc("register_self_student", {
      p_pool_id: String(formData.get("pool_id") ?? ""),
    });
    if (error) {
      fail(lang, packageId, error.message);
    }
    childId = data as string;
  } else if (childId === "new") {
    const { data, error } = await supabase.rpc("register_child", {
      p_full_name: String(formData.get("new_name") ?? ""),
      p_date_of_birth: String(formData.get("new_birth") ?? ""),
      p_pool_id: String(formData.get("pool_id") ?? ""),
    });
    if (error) {
      fail(lang, packageId, error.message);
    }
    childId = data as string;
  }

  const { error } = await supabase.rpc("buy_package", { p_student_id: childId, p_package_id: packageId });
  if (error) {
    fail(lang, packageId, error.message);
  }

  revalidatePath("/portal");
  redirect("/portal?saved=invoice");
}
