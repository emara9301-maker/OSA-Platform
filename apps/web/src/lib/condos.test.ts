import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for condo tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];

type Account = { id: string; client: SupabaseClient };

async function accountWithRole(name: string, role: AccountRole): Promise<Account> {
  const email = `${name}.${runId}@osa.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { age: "30", date_of_birth: "1996-01-01", username: `${name}${runId}` },
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

const completeCondo = {
  name: "Test Condo",
  address: "1 Jalan Test, Kuala Lumpur",
  pool_hours: "7am to 7pm",
  contact_phone: "+60123456789",
};

describe("condos and audit log", () => {
  let owner: Account;
  let coach: Account;
  let departmentHead: Account;
  let student: Account;
  let readyCondoId: string;
  let draftCondoId: string;

  beforeAll(async () => {
    owner = await accountWithRole("owner", "owner");
    coach = await accountWithRole("coach", "coach");
    departmentHead = await accountWithRole("head", "department_head");
    student = await accountWithRole("student", "student");
  });

  afterAll(async () => {
    for (const id of condoIds) {
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("the owner adds a complete condo and it becomes ready", async () => {
    const { data, error } = await owner.client
      .from("condos")
      .insert({ ...completeCondo, name: `Ready ${runId}` })
      .select("id, status, created_by")
      .single();

    expect(error).toBeNull();
    if (!data) {
      throw new Error("condo not created");
    }
    condoIds.push(data.id);
    readyCondoId = data.id;
    expect(data.status).toBe("ready");
    expect(data.created_by).toBe(owner.id);
  });

  it("a department head adds a condo", async () => {
    const { error } = await departmentHead.client
      .from("condos")
      .insert({ ...completeCondo, name: `Head ${runId}` })
      .select("id")
      .single();
    expect(error).toBeNull();
  });

  it("a condo without pool hours stays draft", async () => {
    const { data, error } = await departmentHead.client
      .from("condos")
      .insert({ name: `Draft ${runId}`, address: "2 Jalan Test", contact_phone: "+60123456780" })
      .select("id, status")
      .single();

    expect(error).toBeNull();
    if (!data) {
      throw new Error("condo not created");
    }
    condoIds.push(data.id);
    draftCondoId = data.id;
    expect(data.status).toBe("draft");
  });

  it("a coach cannot add a condo", async () => {
    const { error } = await coach.client.from("condos").insert({ ...completeCondo, name: "Nope" });
    expect(error).not.toBeNull();
  });

  it("a student cannot add a condo", async () => {
    const { error } = await student.client.from("condos").insert({ ...completeCondo, name: "Nope" });
    expect(error).not.toBeNull();
  });

  it("a coach cannot edit a condo", async () => {
    const { data, error } = await coach.client
      .from("condos")
      .update({ name: "Hacked" })
      .eq("id", readyCondoId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a student sees no condos, staff see them", async () => {
    const { data: asStudent } = await student.client.from("condos").select("id");
    const { data: asCoach } = await coach.client.from("condos").select("id");
    expect(asStudent).toEqual([]);
    expect(asCoach?.length).toBeGreaterThan(0);
  });

  it("a coach cannot delete a condo", async () => {
    const { data, error } = await coach.client.from("condos").delete().eq("id", readyCondoId).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a student cannot delete a condo", async () => {
    const { data } = await student.client.from("condos").delete().eq("id", readyCondoId).select("id");
    expect(data).toEqual([]);
  });

  it("a department head deletes a condo", async () => {
    const { data, error } = await departmentHead.client
      .from("condos")
      .delete()
      .eq("id", draftCondoId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a change to a condo is recorded with before and after values", async () => {
    const { error } = await owner.client
      .from("condos")
      .update({ name: `Renamed ${runId}` })
      .eq("id", readyCondoId);
    expect(error).toBeNull();

    const { data } = await owner.client
      .from("audit_log")
      .select("action, actor_id, before_data, after_data")
      .eq("table_name", "condos")
      .eq("record_id", readyCondoId)
      .eq("action", "update");

    expect(data).toHaveLength(1);
    expect(data?.[0].actor_id).toBe(owner.id);
    expect(data?.[0].before_data).toMatchObject({ name: `Ready ${runId}` });
    expect(data?.[0].after_data).toMatchObject({ name: `Renamed ${runId}` });
  });

  it("a deletion is recorded in the audit log", async () => {
    const { data } = await owner.client
      .from("audit_log")
      .select("action, before_data")
      .eq("table_name", "condos")
      .eq("record_id", draftCondoId)
      .eq("action", "delete");

    expect(data).toHaveLength(1);
    expect(data?.[0].before_data).toMatchObject({ name: `Draft ${runId}` });
  });

  it("only the owner and department heads read the audit log", async () => {
    // One row is enough to show who may read the log. The log is long, so a full read would be slow.
    const { data: asCoach } = await coach.client.from("audit_log").select("id").limit(1);
    const { data: asHead } = await departmentHead.client.from("audit_log").select("id").limit(1);
    const { data: asOwner } = await owner.client.from("audit_log").select("id").limit(1);

    expect(asCoach).toEqual([]);
    expect(asHead?.length).toBeGreaterThan(0);
    expect(asOwner?.length).toBeGreaterThan(0);
  });

  it("nobody can change or delete audit entries", async () => {
    const { error: updateError } = await owner.client.from("audit_log").update({ action: "x" }).neq("id", 0);
    const { error: deleteError } = await owner.client.from("audit_log").delete().neq("id", 0);
    expect(updateError).not.toBeNull();
    expect(deleteError).not.toBeNull();
  });

  it("a role change is recorded in the audit log", async () => {
    const { error } = await owner.client.rpc("set_account_role", {
      target_id: student.id,
      new_role: "coach",
    });
    expect(error).toBeNull();

    const { data } = await owner.client
      .from("audit_log")
      .select("before_data, after_data")
      .eq("table_name", "profiles")
      .eq("record_id", student.id);

    expect(data?.[0].before_data).toMatchObject({ role: "student" });
    expect(data?.[0].after_data).toMatchObject({ role: "coach" });
  });
});
