import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for portal tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];
const familyIds: string[] = [];
const minute = 60 * 1000;
const day = 24 * 60 * minute;

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

// A morning slot a few days away, in Malaysia, away from the 17:00 lessons of the test class.
function morningIn(days: number): Date {
  const local = new Date(Date.now() + days * day + 8 * 60 * minute);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3, 13));
}

describe("client portal", () => {
  let owner: Account;
  let coach: Account;
  let parent: Account;
  let otherParent: Account;
  let childId: string;
  let poolId: string;
  let classId: string;
  let sessions: string[];
  let tokenIds: string[];

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    parent = await account("parent", "student");
    otherParent = await account("other", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Portal ${runId}`, address: "9 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444" })
      .select("id")
      .single();
    condoIds.push(condo?.id as string);

    poolId = condo?.id as string;
    const { data: family } = await admin.from("families").insert({ name: `Portal family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: klass } = await owner.client
      .from("classes")
      .insert({
        name: `Portal class ${runId}`,
        condo_id: condo?.id,
        coach_id: coach.id,
        level_id: level?.id,
        weekday: 2,
        start_time: "17:00",
        duration_minutes: 60,
        capacity: 4,
        start_date: "2026-11-01",
        end_date: "2026-12-31",
      })
      .select("id")
      .single();
    classId = klass?.id as string;

    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Portal child ${runId}`, date_of_birth: "2017-01-01", condo_id: condo?.id, family_id: family?.id })
      .select("id")
      .single();
    childId = child?.id as string;
    await admin.from("class_enrolments").insert({ class_id: classId, student_id: childId });

    const { data: upcoming } = await admin.from("sessions").select("id").eq("class_id", classId).order("starts_at").limit(3);
    sessions = (upcoming ?? []).map((row) => row.id as string);

    // Two lessons are cancelled for a holiday, so the child holds two make-up tokens.
    await owner.client.rpc("cancel_session_for_reason", { p_session_id: sessions[0], p_kind: "holiday", p_reason: "Holiday" });
    await owner.client.rpc("cancel_session_for_reason", { p_session_id: sessions[1], p_kind: "holiday", p_reason: "Holiday" });
    const { data: tokens } = await admin.from("make_up_tokens").select("id").eq("student_id", childId).eq("status", "open");
    tokenIds = (tokens ?? []).map((row) => row.id as string);
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("classes").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a parent sees the child's open make-up tokens and the class's suggested-time context", async () => {
    const { data: tokens } = await parent.client.from("make_up_tokens").select("id").eq("student_id", childId).eq("status", "open");
    expect(tokens).toHaveLength(2);

    const { data: context } = await parent.client.rpc("make_up_schedule_context", { p_class_id: classId });
    expect(context).toMatchObject({ pool_hours: "7am-10pm", duration_minutes: 60 });
  });

  it("another family gets no schedule context and cannot book the child's make-up", async () => {
    const { data: context } = await otherParent.client.rpc("make_up_schedule_context", { p_class_id: classId });
    expect(context).toBeNull();

    const { error } = await otherParent.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: morningIn(3).toISOString(),
      p_token_ids: tokenIds,
    });
    expect(error?.message).toContain("You cannot book this make-up lesson.");
  });

  it("a parent cannot approve a clash, but can book a free time for the child", async () => {
    const slot = morningIn(3);
    await admin.from("sessions").insert({
      class_id: classId,
      starts_at: new Date(slot.getTime() + 20 * minute).toISOString(),
      ends_at: new Date(slot.getTime() + 80 * minute).toISOString(),
    });

    const approved = await parent.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: slot.toISOString(),
      p_token_ids: [tokenIds[0]],
      p_ops_approved: true,
    });
    expect(approved.error?.message).toContain("You cannot book this make-up lesson.");

    const clash = await parent.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: slot.toISOString(),
      p_token_ids: [tokenIds[0]],
    });
    expect(clash.error?.message).toContain("Operations must approve");

    const { data, error } = await parent.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: morningIn(4).toISOString(),
      p_token_ids: [tokenIds[0]],
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("a parent cannot record a payment; only the server path can, and then the package starts", async () => {
    const { data: packageRow } = await owner.client
      .from("packages")
      .insert({ condo_id: poolId, name: `Portal package ${runId}`, type: "small_group", sessions_count: 4, session_minutes: 60, price: 100, is_active: true })
      .select("id")
      .single();
    const { data: invoiceId } = await owner.client.rpc("create_invoice", {
      p_student_id: childId,
      p_package_id: packageRow?.id,
    });

    const byParent = await parent.client.rpc("record_payment", { p_invoice_id: invoiceId, p_gateway: "mock", p_gateway_ref: "X" });
    expect(byParent.error?.message).toContain("Only managers");

    const direct = await parent.client.rpc("apply_payment", {
      p_invoice_id: invoiceId,
      p_gateway: "mock",
      p_gateway_ref: "X",
      p_recorded_by: parent.id,
    });
    expect(direct.error).not.toBeNull();

    const { error } = await admin.rpc("apply_payment", {
      p_invoice_id: invoiceId,
      p_gateway: "mock",
      p_gateway_ref: "MOCK-PORTAL",
      p_recorded_by: parent.id,
    });
    expect(error).toBeNull();
    const { data: paid } = await admin.from("invoices").select("status").eq("id", invoiceId as string).single();
    expect(paid?.status).toBe("paid");

    await admin.from("packages").delete().eq("id", packageRow?.id as string);
  });
});
