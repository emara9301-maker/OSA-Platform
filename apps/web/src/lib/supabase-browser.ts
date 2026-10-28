"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./supabase";

export function createBrowserSupabase() {
  const { url, key } = supabaseConfig();
  return createBrowserClient(url, key);
}
