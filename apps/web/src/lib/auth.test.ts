import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for auth tests");
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = Math.random().toString(36).slice(2, 8);
const createdUserIds: string[] = [];

async function createUser(name: string, metadata: Record<string, string>) {
  const email = `${name}.${runId}@osa.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "123456",
    user_metadata: { age: "30", date_of_birth: "1996-01-01", ...metadata },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "user not created");
  }
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

afterAll(async () => {
  await admin.from("students").delete().in("account_id", createdUserIds);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("sign-up profile", () => {
  it("creates a student profile with the phone number and username from sign-up", async () => {
    const username = `ph${runId}`;
    const user = await createUser("signup", { phone: "+60123456789", username });

    const { data: profile, error } = await admin
      .from("profiles")
      .select("email, phone, username, age, role")
      .eq("id", user.id)
      .single();

    expect(error).toBeNull();
    expect(profile).toEqual({ email: user.email, phone: "+60123456789", username, age: 30, role: "student" });
  });
});

describe("usernames", () => {
  const username = `us${runId}`;

  it("a username is available only when no account uses it, ignoring case", async () => {
    await createUser("taken", { username });

    const { data: taken } = await anon.rpc("is_username_available", { name: username.toUpperCase() });
    const { data: free } = await anon.rpc("is_username_available", { name: `free${runId}` });
    expect(taken).toBe(false);
    expect(free).toBe(true);
  });

  it("sign-up creates the account's own student record with the name and date of birth", async () => {
    const username = `own${runId}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `own.${runId}@osa.test`,
      password: "123456",
      email_confirm: true,
      user_metadata: { username, full_name: "Own Student", date_of_birth: "1995-05-05", phone: "+60123456700" },
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "user not created");
    }
    createdUserIds.push(data.user.id);

    const { data: student } = await admin
      .from("students")
      .select("full_name, date_of_birth, account_id, family_id, condo_id")
      .eq("account_id", data.user.id);
    expect(student).toEqual([
      { full_name: "Own Student", date_of_birth: "1995-05-05", account_id: data.user.id, family_id: null, condo_id: null },
    ]);

    const { data: profile } = await admin.from("profiles").select("age").eq("id", data.user.id).single();
    expect(profile?.age).toBeGreaterThanOrEqual(29);
  });

  it("an account cannot be created without an age", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: `noage.${runId}@osa.test`,
      password: "123456",
      user_metadata: { username: `noage${runId}` },
    });
    expect(error).not.toBeNull();
  });

  it("an account cannot be created without a username", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: `nousername.${runId}@osa.test`,
      password: "123456",
    });
    expect(error).not.toBeNull();
  });

  it("two accounts cannot share a username, even with different case", async () => {
    await createUser("first", { username: `dup${runId}` });
    const second = admin.auth.admin.createUser({
      email: `second.${runId}@osa.test`,
      password: "123456",
      user_metadata: { age: "30", date_of_birth: "1996-01-01", username: `DUP${runId}` },
    });

    const { error } = await second;
    expect(error).not.toBeNull();
  });
});
