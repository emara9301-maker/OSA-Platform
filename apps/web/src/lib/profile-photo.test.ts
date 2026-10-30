import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for profile photo tests");
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = Math.random().toString(36).slice(2, 8);
const createdUserIds: string[] = [];
const password = "test-pass-123";

type Account = { id: string; email: string; client: SupabaseClient };

async function createStudent(name: string): Promise<Account> {
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
  createdUserIds.push(data.user.id);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(signInError.message);
  }
  return { id: data.user.id, email, client };
}

describe("profile photos", () => {
  let alice: Account;
  let bob: Account;
  const bytes = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

  beforeAll(async () => {
    alice = await createStudent("alice");
    bob = await createStudent("bob");
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("lets a student set their own photo path", async () => {
    const path = `${alice.id}/photo-${runId}.png`;
    await alice.client.storage.from("profile-photos").upload(path, bytes, { contentType: "image/png" });

    const { error } = await alice.client.rpc("set_profile_photo", { p_path: path });

    expect(error).toBeNull();
    const { data } = await admin.from("profiles").select("avatar_path").eq("id", alice.id).single();
    expect(data?.avatar_path).toBe(path);
  });

  it("stops a student from pointing their photo at another account's folder", async () => {
    const { error } = await alice.client.rpc("set_profile_photo", { p_path: `${bob.id}/photo.png` });

    expect(error).not.toBeNull();
  });

  it("stops a student from uploading into another account's folder", async () => {
    const { error } = await alice.client.storage
      .from("profile-photos")
      .upload(`${bob.id}/intruder-${runId}.png`, bytes, { contentType: "image/png" });

    expect(error).not.toBeNull();
  });

  it("hides a student's photo from another student", async () => {
    const { data, error } = await bob.client.storage
      .from("profile-photos")
      .createSignedUrl(`${alice.id}/photo-${runId}.png`, 60);

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
