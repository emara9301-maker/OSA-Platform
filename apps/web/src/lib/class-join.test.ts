import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for class join tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];
const familyIds: string[] = [];
const packageIds: string[] = [];

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

const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("joining a class needs a paid package at the pool", () => {
  let owner: Account;
  let coach: Account;
  let adult: Account;
  let waiting: Account;
  let parent: Account;
  let stranger: Account;
  let condoId: string;
  let poolId: string;
  let packageId: string;
  let fullClassId: string;
  let freeClassId: string;
  let clashClassId: string;
  let childId: string;

  // Buys and pays a package for a student, the same way the purchase page does.
  async function payFor(studentId: string) {
    await owner.client.rpc("create_invoice", { p_student_id: studentId, p_package_id: packageId });
    const { data: invoice } = await admin.from("invoices").select("id").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1).single();
    await owner.client.rpc("record_payment", { p_invoice_id: invoice?.id, p_gateway: "mock", p_gateway_ref: `JOIN-${runId}-${studentId}` });
  }

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    adult = await account("adult", "student");
    waiting = await account("waiting", "student");
    parent = await account("parent", "student");
    stranger = await account("stranger", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Join condo ${runId}`, address: "5 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60177777777" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);

    const { data: pool } = await admin.from("pools").select("id").eq("condo_id", condoId).single();
    poolId = pool?.id as string;

    const { data: pkg } = await owner.client
      .from("packages")
      .insert({ pool_id: poolId, name: `Join package ${runId}`, type: "small_group", sessions_count: 8, session_minutes: 45, price: 90, is_active: true })
      .select("id")
      .single();
    packageId = pkg?.id as string;
    packageIds.push(packageId);

    const { data: level } = await admin.from("levels").select("id").limit(1).single();
    const base = { condo_id: condoId, coach_id: coach.id, level_id: level?.id, class_type: "group", weekday: 1, duration_minutes: 60, start_date: today, end_date: later, pool_id: poolId };
    const { data: full } = await admin.from("classes").insert({ ...base, name: `Full ${runId}`, start_time: "10:00", capacity: 1 }).select("id").single();
    fullClassId = full?.id as string;
    const { data: free } = await admin.from("classes").insert({ ...base, name: `Free ${runId}`, start_time: "15:00", capacity: 5 }).select("id").single();
    freeClassId = free?.id as string;
    const { data: clash } = await admin.from("classes").insert({ ...base, name: `Clash ${runId}`, start_time: "15:30", capacity: 5 }).select("id").single();
    clashClassId = clash?.id as string;

    const { data: family } = await admin.from("families").insert({ name: `Join family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });
    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Join child ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, pool_id: poolId, family_id: family?.id })
      .select("id")
      .single();
    childId = child?.id as string;
  });

  afterAll(async () => {
    await admin.from("class_enrolments").delete().in("class_id", [fullClassId, freeClassId, clashClassId]);
    await admin.from("students").delete().in("condo_id", condoIds);
    await admin.from("classes").delete().in("condo_id", condoIds);
    for (const id of packageIds) {
      await admin.from("packages").delete().eq("id", id);
    }
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

  it("an account with no paid package at the pool cannot join", async () => {
    const { error } = await adult.client.rpc("join_class", { p_class_id: freeClassId });

    expect(error?.message).toContain("Buy a package at this pool first");
  });

  it("after the package is paid, the account joins and the place is confirmed (no hold)", async () => {
    const { data: record, error: buyError } = await adult.client.rpc("register_self_student", { p_pool_id: poolId });
    expect(buyError).toBeNull();
    await payFor(record as string);

    const { error } = await adult.client.rpc("join_class", { p_class_id: freeClassId });
    expect(error).toBeNull();

    const { data: enrolment } = await admin.from("class_enrolments").select("hold_until").eq("class_id", freeClassId);
    expect(enrolment?.length).toBe(1);
    expect(enrolment?.[0].hold_until).toBeNull();

    const again = await adult.client.rpc("join_class", { p_class_id: freeClassId });
    expect(again.error?.message).toContain("already joined");
  });

  it("a full class takes no more students", async () => {
    await adult.client.rpc("join_class", { p_class_id: fullClassId });

    const { data: record } = await waiting.client.rpc("register_self_student", { p_pool_id: poolId });
    await payFor(record as string);
    const { error } = await waiting.client.rpc("join_class", { p_class_id: fullClassId });
    expect(error?.message).toContain("full");
  });

  it("a parent joins for a child only after the child's package is paid, and a stranger cannot join for that child", async () => {
    const unpaid = await parent.client.rpc("join_class", { p_class_id: freeClassId, p_student_id: childId });
    expect(unpaid.error?.message).toContain("Buy a package at this pool first");

    await payFor(childId);
    const byParent = await parent.client.rpc("join_class", { p_class_id: freeClassId, p_student_id: childId });
    expect(byParent.error).toBeNull();

    const byStranger = await stranger.client.rpc("join_class", { p_class_id: freeClassId, p_student_id: childId });
    expect(byStranger.error?.message).toContain("own children");
  });

  it("a class at the same time as one already joined is refused", async () => {
    const { error } = await adult.client.rpc("join_class", { p_class_id: clashClassId });

    expect(error?.message).toContain("clashes");
  });
});
