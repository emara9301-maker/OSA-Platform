"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { languageCookie, languages, type Lang } from "@/lib/i18n";

export async function setLanguage(formData: FormData) {
  const requested = String(formData.get("lang") ?? "");
  const lang: Lang = (languages as readonly string[]).includes(requested) ? (requested as Lang) : "en";
  (await cookies()).set(languageCookie, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect("/");
}
