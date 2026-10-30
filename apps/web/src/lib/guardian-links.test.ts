import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for guardian link tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];
const familyIds: string[] = [];

type Account = { id: string; client: SupabaseClient };

async function account(name: string, role: AccountRole, kind: "student" | "guardian" = "student"): Promise<Account> {
  const email = `${name}.${runId}@osa.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { age: "35", date_of_birth: "1996-01-01", username: `${name}_${runId}`, account_kind: kind },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "user not created");
  }
  userIds.push(data.user.id);

  if (role !== "student") {
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) {
      throw new Error(roleError.message);
    }
  }

  const client = createClient(url, key, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(signInError.message);
  }
  return { id: data.user.id, client };
}

describe("guardian link requests", () => {
  let owner: Account;
  let coach: Account;
  let guardian: Account;
  let secondGuardian: Account;
  let childId: string;
  let childToken: string;
  let familyId: string;
  let homelessChildToken: string;
  let requestId: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    guardian = await account("parent", "student", "guardian");
    secondGuardian = await account("uncle", "student", "guardian");

    const { data: condo, error: condoError } = await owner.client
      .from("condos")
      .insert({ name: `Links ${runId}`, address: "4 Jalan Test", pool_hours: "7-7", contact_phone: "+60122222222" })
      .select("id")
      .single();
    if (condoError || !condo) {
      throw new Error(condoError?.message ?? "condo not created");
    }
    condoIds.push(condo.id);

    const { data: family, error: familyError } = await owner.client
      .from("families")
      .insert({ name: `Links family ${runId}` })
      .select("id")
      .single();
    if (familyError || !family) {
      throw new Error(familyError?.message ?? "family not created");
    }
    familyId = family.id;
    familyIds.push(familyId);

    const { data: child, error: childError } = await owner.client
      .from("students")
      .insert({ full_name: "Linked Child", date_of_birth: "2019-02-02", condo_id: condo.id, family_id: familyId })
      .select("id, qr_token")
      .single();
    if (childError || !child) {
      throw new Error(childError?.message ?? "student not created");
    }
    childId = child.id;
    childToken = child.qr_token;

    const { data: loose, error: looseError } = await owner.client
      .from("students")
      .insert({ full_name: "Child Without Family", date_of_birth: "2020-01-01", condo_id: condo.id })
      .select("qr_token")
      .single();
    if (looseError || !loose) {
      throw new Error(looseError?.message ?? "student not created");
    }
    homelessChildToken = loose.qr_token;
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a wrong QR code is refused", async () => {
    const { error } = await guardian.client.rpc("request_guardian_link", {
      p_token: "00000000-0000-0000-0000-000000000000",
      p_relationship: "Mother",
    });
    expect(error?.message).toContain("No child matches this QR code");
  });

  it("a guardian sends a request with the child's QR code; it is pending", async () => {
    const { data, error } = await guardian.client.rpc("request_guardian_link", {
      p_token: childToken,
      p_relationship: "Mother",
    });
    expect(error).toBeNull();
    requestId = data as string;

    const { data: rows } = await owner.client
      .from("guardian_link_requests")
      .select("status, relationship")
      .eq("id", requestId);
    expect(rows).toEqual([{ status: "pending", relationship: "Mother" }]);
  });

  it("the same guardian cannot send a second pending request for the same child", async () => {
    const { error } = await guardian.client.rpc("request_guardian_link", {
      p_token: childToken,
      p_relationship: "Mother",
    });
    expect(error?.message).toContain("pending request");
  });

  it("until approved, the guardian cannot see the child", async () => {
    const { data } = await guardian.client.from("students").select("id").eq("id", childId);
    expect(data).toEqual([]);
  });

  it("a coach cannot approve or reject requests", async () => {
    const { error } = await coach.client.rpc("decide_guardian_link", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(error?.message).toContain("Only the owner and department heads");
  });

  it("the guardian cannot approve their own request", async () => {
    const { error } = await guardian.client.rpc("decide_guardian_link", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(error).not.toBeNull();
  });

  it("approving a child with no family creates a family for them automatically", async () => {
    const { data: request, error: requestError } = await secondGuardian.client.rpc("request_guardian_link", {
      p_token: homelessChildToken,
      p_relationship: "Uncle",
    });
    expect(requestError).toBeNull();

    const { error } = await owner.client.rpc("decide_guardian_link", {
      p_request_id: request as string,
      p_approve: true,
    });
    expect(error).toBeNull();

    const { data: child } = await owner.client
      .from("students")
      .select("family_id, families(name)")
      .eq("qr_token", homelessChildToken)
      .single();
    expect(child?.family_id).not.toBeNull();
    familyIds.push(child?.family_id as string);

    const { data: visible } = await secondGuardian.client.from("students").select("id").eq("qr_token", homelessChildToken);
    expect(visible).toHaveLength(1);
  });

  it("the owner approves; the guardian is linked and sees the child", async () => {
    const { error } = await owner.client.rpc("decide_guardian_link", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(error).toBeNull();

    const { data: visible } = await guardian.client.from("students").select("id").eq("id", childId);
    expect(visible).toEqual([{ id: childId }]);

    const { data: link } = await owner.client
      .from("family_guardians")
      .select("relationship")
      .eq("family_id", familyId)
      .eq("profile_id", guardian.id);
    expect(link).toEqual([{ relationship: "Mother" }]);
  });

  it("an already linked guardian cannot request the same child again", async () => {
    const { error } = await guardian.client.rpc("request_guardian_link", {
      p_token: childToken,
      p_relationship: "Mother",
    });
    expect(error?.message).toContain("already linked");
  });

  it("a rejected request links nobody", async () => {
    const { data: request } = await secondGuardian.client.rpc("request_guardian_link", {
      p_token: childToken,
      p_relationship: "Uncle",
    });

    const { error } = await owner.client.rpc("decide_guardian_link", {
      p_request_id: request as string,
      p_approve: false,
    });
    expect(error).toBeNull();

    const { data: status } = await owner.client
      .from("guardian_link_requests")
      .select("status")
      .eq("id", request as string);
    expect(status).toEqual([{ status: "rejected" }]);

    const { data: visible } = await secondGuardian.client.from("students").select("id").eq("id", childId);
    expect(visible).toEqual([]);
  });

  it("the approval is recorded in the audit log with the owner as actor", async () => {
    const { data } = await owner.client
      .from("audit_log")
      .select("actor_id, after_data")
      .eq("table_name", "guardian_link_requests")
      .eq("record_id", requestId)
      .eq("action", "update");

    expect(data?.[0].actor_id).toBe(owner.id);
    expect(data?.[0].after_data).toMatchObject({ status: "approved" });
  });
});
