import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for pool tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];
const familyIds: string[] = [];

type Account = { id: string; client: SupabaseClient };

async function account(name: string, role: AccountRole): Promise<Account> {
  const email = `${name}.${runId}@osa.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { age: "30", date_of_birth: "1996-01-01", username: `${name}_${runId}` },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "user not created");
  }
  userIds.push(data.user.id);
  if (role !== "student") {
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
  }
  const client = createClient(url, key, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(signInError.message);
  }
  return { id: data.user.id, client };
}

describe("pools inside a condo", () => {
  let owner: Account;
  let parent: Account;
  let condoId: string;
  let poolA: string;
  let poolB: string;
  let packageAtB: string;
  let childAtA: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    parent = await account("parent", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Pools ${runId}`, address: "1 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);

    const { data: first } = await admin.from("pools").select("id").eq("condo_id", condoId).single();
    poolA = first?.id as string;

    const { data: second, error: secondError } = await owner.client
      .from("pools")
      .insert({ condo_id: condoId, name: `Kids pool ${runId}`, pool_hours: "8am-6pm", sort_order: 1 })
      .select("id")
      .single();
    if (secondError) {
      throw new Error(`second pool: ${secondError.message}`);
    }
    poolB = second?.id as string;

    const { data: pkg } = await owner.client
      .from("packages")
      .insert({ pool_id: poolB, name: `Kids package ${runId}`, type: "small_group", sessions_count: 4, session_minutes: 45, price: 90, is_active: true })
      .select("id, condo_id")
      .single();
    packageAtB = pkg?.id as string;

    const { data: family } = await admin.from("families").insert({ name: `Pools family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });
    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Pools child ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, pool_id: poolA, family_id: family?.id })
      .select("id")
      .single();
    childAtA = child?.id as string;
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    await admin.from("packages").delete().eq("id", packageAtB);
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("pools").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a new condo starts with a main pool, and a second pool sits beside it", async () => {
    const { data } = await admin.from("pools").select("name").eq("condo_id", condoId).order("sort_order");
    expect(data?.map((row) => row.name)).toEqual(["Main pool", `Kids pool ${runId}`]);
  });

  it("a child cannot buy a package of another pool in the same condo", async () => {
    const { error } = await parent.client.rpc("buy_package", { p_student_id: childAtA, p_package_id: packageAtB });
    expect(error?.message).toContain("not offered at this pool");
  });
});
