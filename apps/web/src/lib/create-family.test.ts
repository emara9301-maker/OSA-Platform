import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for create family tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
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

describe("creating a family", () => {
  let independent: Account;
  let owner: Account;

  beforeAll(async () => {
    independent = await account("independent", "student");
    owner = await account("owner", "owner");
  });

  afterAll(async () => {
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("an independent account creates its own family as a guardian", async () => {
    const { data, error } = await independent.client.rpc("create_my_family", { p_name: `Solo ${runId}` });
    expect(error).toBeNull();
    familyIds.push(data as string);

    const { data: guardian } = await admin.from("family_guardians").select("profile_id").eq("family_id", data as string);
    expect(guardian).toEqual([{ profile_id: independent.id }]);
  });

  it("an account cannot create a second family", async () => {
    const { error } = await independent.client.rpc("create_my_family", { p_name: `Again ${runId}` });

    expect(error?.message).toContain("already has a family");
  });

  it("staff cannot create a family for themselves", async () => {
    const { error } = await owner.client.rpc("create_my_family", { p_name: `Staff ${runId}` });

    expect(error).not.toBeNull();
  });
});
