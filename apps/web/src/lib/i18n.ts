import { cookies } from "next/headers";
import { languages, type Lang } from "./messages";

// The language choice is kept in a cookie. Server pages read it here; browser components get it as a prop.
export { languages, localeFor, t, type Key, type Lang } from "./messages";
export const languageCookie = "osa_lang";

export async function currentLang(): Promise<Lang> {
  const value = (await cookies()).get(languageCookie)?.value;
  return (languages as readonly string[]).includes(value ?? "") ? (value as Lang) : "en";
}
