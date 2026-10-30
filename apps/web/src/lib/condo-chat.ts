import type { SupabaseClient } from "@supabase/supabase-js";
import { localeFor, t, type Lang } from "./i18n";
import { profilePhotoUrl } from "./uploads";

export type ChatMessage = {
  id: string;
  authorId: string;
  username: string;
  photoUrl: string | null;
  body: string;
  time: string;
};

type Row = {
  id: string;
  author_id: string;
  username: string | null;
  avatar_path: string | null;
  body: string;
  created_at: string;
};

// The latest messages of a condo chat, oldest first. Shows only the username and photo of each author.
export async function loadCondoChat(client: SupabaseClient, condoId: string, lang: Lang): Promise<ChatMessage[]> {
  const { data } = await client.rpc("list_condo_messages", { p_condo_id: condoId });
  const rows = ((data ?? []) as Row[]).reverse();

  const paths = [...new Set(rows.map((row) => row.avatar_path).filter((path): path is string => path !== null))];
  const urls = new Map<string, string | null>();
  for (const path of paths) {
    urls.set(path, await profilePhotoUrl(client, path));
  }

  return rows.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    username: row.username ?? t(lang, "chatUnknown"),
    photoUrl: row.avatar_path ? (urls.get(row.avatar_path) ?? null) : null,
    body: row.body,
    time: new Date(row.created_at).toLocaleString(localeFor(lang), { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }),
  }));
}
