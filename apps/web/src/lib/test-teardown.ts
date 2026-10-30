import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

// After a test run, removes the condos this run created (with their pools, classes and packages), so test data does not pile up.
// The four condos named "(test)" are kept: they are the sample condos for trying the app.
export default function setup() {
  const startedAt = new Date().toISOString();

  return async function teardown() {
    const env = loadEnv("test", process.cwd(), "");
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      return;
    }
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data } = await admin.from("condos").select("id, name").gte("created_at", startedAt);
    const ids = ((data ?? []) as { id: string; name: string }[])
      .filter((condo) => !condo.name.endsWith("(test)"))
      .map((condo) => condo.id);
    if (ids.length === 0) {
      return;
    }

    await admin.from("students").delete().in("condo_id", ids);
    await admin.from("classes").delete().in("condo_id", ids);
    await admin.from("packages").delete().in("condo_id", ids);
    await admin.from("pools").delete().in("condo_id", ids);
    await admin.from("condos").delete().in("id", ids);
  };
}
