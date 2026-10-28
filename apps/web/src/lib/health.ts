import { createSupabaseClient } from "./supabase";

export async function checkDatabase(): Promise<Date> {
  const { data, error } = await createSupabaseClient().rpc("health_check");

  if (error) {
    throw new Error(error.message);
  }

  return new Date(data as string);
}
