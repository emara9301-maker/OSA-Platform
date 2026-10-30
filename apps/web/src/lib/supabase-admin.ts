import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabase";

// Server only. Used once by the portal payment path, which records a payment after the gateway accepts it.
// Never import this from a client component.
export function createAdminSupabase() {
  const { url } = supabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
