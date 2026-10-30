import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for student status tests");
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

describe("student status", () => {
  let owner: Account;
  let parent: Account;
  let condoId: string;
  let packageId: string;
  let childId: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    parent = await account("parent", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Status condo ${runId}`, address: "4 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60166666666" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);

    const { data: pool } = await admin.from("pools").select("id").eq("condo_id", condoId).single();
    const { data: pkg } = await owner.client
      .from("packages")
      .insert({ pool_id: pool?.id, name: `Status package ${runId}`, type: "small_group", sessions_count: 4, session_minutes: 45, price: 90, is_active: true })
      .select("id")
      .single();
    packageId = pkg?.id as string;

    const { data: family } = await admin.from("families").insert({ name: `Status family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });
    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Status child ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, pool_id: pool?.id, family_id: family?.id })
      .select("id")
      .single();
    childId = child?.id as string;
  });

  afterAll(async () => {
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

  it("a lead becomes active when its first package is paid", async () => {
    const { data: before } = await admin.from("students").select("status").eq("id", childId).single();
    expect(before?.status).toBe("lead");

    await owner.client.rpc("create_invoice", { p_student_id: childId, p_package_id: packageId });
    const { data: invoice } = await admin.from("invoices").select("id").eq("student_id", childId).single();
    await owner.client.rpc("record_payment", { p_invoice_id: invoice?.id, p_gateway: "mock", p_gateway_ref: `STATUS-${runId}` });

    const { data: after } = await admin.from("students").select("status").eq("id", childId).single();
    expect(after?.status).toBe("active");
  });

  it("a paused student keeps its status when a payment is recorded", async () => {
    await admin.from("students").update({ status: "paused" }).eq("id", childId);
    const { data: invoice } = await admin.from("invoices").select("id").eq("student_id", childId).single();
    await admin.from("invoices").update({ status: "unpaid" }).eq("id", invoice?.id as string);
    await admin.from("invoices").update({ status: "paid" }).eq("id", invoice?.id as string);

    const { data: after } = await admin.from("students").select("status").eq("id", childId).single();
    expect(after?.status).toBe("paused");
  });
});
