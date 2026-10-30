import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for condo chat tests");
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

describe("condo chat", () => {
  let owner: Account;
  let member: Account;
  let outsider: Account;
  let condoId: string;
  let packageId: string;
  let childId: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    member = await account("member", "student");
    outsider = await account("outsider", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Chat condo ${runId}`, address: "3 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60155555555" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);

    const { data: pool } = await admin.from("pools").select("id").eq("condo_id", condoId).single();
    const { data: pkg } = await owner.client
      .from("packages")
      .insert({ pool_id: pool?.id, name: `Chat package ${runId}`, type: "small_group", sessions_count: 4, session_minutes: 45, price: 90, is_active: true })
      .select("id")
      .single();
    packageId = pkg?.id as string;

    const { data: family } = await admin.from("families").insert({ name: `Chat family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: member.id, relationship: "mother" });
    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Chat child ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, pool_id: pool?.id, family_id: family?.id })
      .select("id")
      .single();
    childId = child?.id as string;

    await owner.client.rpc("create_invoice", { p_student_id: childId, p_package_id: packageId });
  });

  afterAll(async () => {
    await admin.from("condo_messages").delete().eq("condo_id", condoId);
    await admin.from("students").delete().in("condo_id", condoIds);
    await admin.from("packages").delete().eq("id", packageId);
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

  it("a family with a purchase at the condo can write, and the chat shows the username only", async () => {
    const { error } = await member.client.rpc("post_condo_message", { p_condo_id: condoId, p_body: `hello ${runId}` });
    expect(error).toBeNull();

    const { data, error: listError } = await member.client.rpc("list_condo_messages", { p_condo_id: condoId });
    expect(listError).toBeNull();
    const row = (data ?? [])[0] as Record<string, unknown>;
    expect(row.body).toBe(`hello ${runId}`);
    expect(row.username).toBe(`member_${runId}`);
    expect(Object.keys(row).sort()).toEqual(["author_id", "avatar_path", "body", "created_at", "id", "username"]);
  });

  it("an account with no purchase at the condo can neither write nor read the chat", async () => {
    const { error } = await outsider.client.rpc("post_condo_message", { p_condo_id: condoId, p_body: "let me in" });
    expect(error).not.toBeNull();

    const { data } = await outsider.client.rpc("list_condo_messages", { p_condo_id: condoId });
    expect(data).toEqual([]);
  });

  it("nobody writes to the table directly", async () => {
    const { error } = await member.client.from("condo_messages").insert({ condo_id: condoId, author_id: member.id, body: "direct" });

    expect(error).not.toBeNull();
  });

  it("the owner can read the chat and delete a message, a family member cannot delete", async () => {
    const { data: rows } = await member.client.rpc("list_condo_messages", { p_condo_id: condoId });
    const messageId = (rows ?? [])[0]?.id as string;

    const memberDelete = await member.client.rpc("delete_condo_message", { p_message_id: messageId });
    expect(memberDelete.error).not.toBeNull();

    const { data: ownerRows } = await owner.client.rpc("list_condo_messages", { p_condo_id: condoId });
    expect(ownerRows?.length).toBeGreaterThan(0);

    const ownerDelete = await owner.client.rpc("delete_condo_message", { p_message_id: messageId });
    expect(ownerDelete.error).toBeNull();
  });

  it("messages older than the retention period are hidden, and removed when someone writes", async () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inserted } = await admin
      .from("condo_messages")
      .insert({ condo_id: condoId, author_id: member.id, body: `old ${runId}`, created_at: old })
      .select("id")
      .single();

    const { data: visible } = await member.client.rpc("list_condo_messages", { p_condo_id: condoId });
    expect((visible ?? []).map((row: { body: string }) => row.body)).not.toContain(`old ${runId}`);

    await member.client.rpc("post_condo_message", { p_condo_id: condoId, p_body: `new ${runId}` });
    const { data: stillThere } = await admin.from("condo_messages").select("id").eq("id", inserted?.id as string);
    expect(stillThere).toEqual([]);
  });
});
