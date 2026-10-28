import type { SupabaseClient } from "@supabase/supabase-js";

export const accountRoles = [
  "owner",
  "department_head",
  "sales",
  "operations",
  "finance",
  "head_coach",
  "coach",
  "student",
] as const;

export type AccountRole = (typeof accountRoles)[number];

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  username: string | null;
  role: AccountRole;
  is_active: boolean;
};

export async function getCurrentProfile(client: SupabaseClient): Promise<Profile | null> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return null;
  }

  const { data, error } = await client
    .from("profiles")
    .select("id, email, full_name, username, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile | null;
}
