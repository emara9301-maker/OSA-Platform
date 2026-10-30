import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for hold and proposal tests");
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

function todayAt(hour: number): Date {
  const local = new Date(Date.now() + 8 * 60 * minute);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - 8, 0));
}

// A morning slot in Malaysia, away from the 17:00 lessons of the test class.
function morningIn(days: number): Date {
  return new Date(todayAt(11).getTime() + days * day + 13 * minute);
}

async function setSetting(key: string, value: number) {
  await admin.from("settings").update({ value }).eq("key", key);
}

describe("families on hold, and coaches proposing make-up times", () => {
  let owner: Account;
  let coach: Account;
  let parent: Account;
  let condoId: string;
  let childId: string;
  let packageId: string;
  let classId: string;
  let sessions: string[];
  let unpaidInvoiceId: string;

  async function usedSessions() {
    const { data } = await admin.from("student_packages").select("sessions_used").eq("student_id", childId);
    return (data ?? []).reduce((sum, row) => sum + Number(row.sessions_used), 0);
  }

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    parent = await account("parent", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Hold ${runId}`, address: "2 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);

    const { data: family } = await admin.from("families").insert({ name: `Hold family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });

    const { data: pkg } = await owner.client
      .from("packages")
      .insert({ condo_id: condoId, name: `Hold package ${runId}`, type: "small_group", sessions_count: 8, session_minutes: 60, price: 100, is_active: true })
      .select("id")
      .single();
    packageId = pkg?.id as string;

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: klass } = await owner.client
      .from("classes")
      .insert({
        name: `Hold class ${runId}`,
        condo_id: condoId,
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
      .insert({ full_name: `Hold child ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, family_id: family?.id })
      .select("id")
      .single();
    childId = child?.id as string;
    await admin.from("class_enrolments").insert({ class_id: classId, student_id: childId });

    const { data: upcoming } = await admin.from("sessions").select("id").eq("class_id", classId).order("starts_at").limit(6);
    sessions = (upcoming ?? []).map((row) => row.id as string);

    // Paid up, then a renewal that fell due 40 days ago and is still unpaid: the child is on hold.
    const { data: paidInvoice } = await owner.client.rpc("create_invoice", { p_student_id: childId, p_package_id: packageId });
    await admin.rpc("apply_payment", { p_invoice_id: paidInvoice, p_gateway: "mock", p_gateway_ref: "MOCK-HOLD-1", p_recorded_by: owner.id });
    const { data: renewal } = await owner.client.rpc("create_invoice", { p_student_id: childId, p_package_id: packageId });
    unpaidInvoiceId = renewal as string;
    const overdue = new Date(Date.now() + 8 * 60 * minute - 40 * day).toISOString().slice(0, 10);
    await admin.from("invoices").update({ due_on: overdue }).eq("id", unpaidInvoiceId);
  });

  afterAll(async () => {
    await setSetting("hold_stops_classes", 1);
    await setSetting("coach_propose_make_up", 1);
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("classes").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    await admin.from("packages").delete().eq("id", packageId);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a family on hold cannot be marked as attending, and the coach is told why", async () => {
    await admin
      .from("sessions")
      .update({ starts_at: todayAt(12).toISOString(), ends_at: new Date(todayAt(12).getTime() + 60 * minute).toISOString() })
      .eq("id", sessions[0]);
    const before = await usedSessions();
    await setSetting("hold_stops_classes", 1);

    const { error } = await coach.client.from("attendance").upsert(
      [{ session_id: sessions[0], student_id: childId, status: "present", excused: false }],
      { onConflict: "session_id,student_id" },
    );
    expect(error?.message).toContain("On hold for payment");
    expect(await usedSessions()).toBe(before);
  });

  it("when the setting keeps classes running, the lesson is deducted and operations is alerted", async () => {
    await admin
      .from("sessions")
      .update({ starts_at: todayAt(13).toISOString(), ends_at: new Date(todayAt(13).getTime() + 60 * minute).toISOString() })
      .eq("id", sessions[1]);
    const before = await usedSessions();
    await setSetting("hold_stops_classes", 0);

    await coach.client.from("attendance").upsert(
      [{ session_id: sessions[1], student_id: childId, status: "present", excused: false }],
      { onConflict: "session_id,student_id" },
    );
    expect(await usedSessions()).toBe(before + 1);
    await setSetting("hold_stops_classes", 1);
  });

  it("a family on hold cannot book a make-up lesson", async () => {
    const { data } = await owner.client.rpc("cancel_session_for_reason", {
      p_session_id: sessions[2],
      p_kind: "holiday",
      p_reason: "Holiday",
    });
    expect(data).toBe("cancelled");
    const { data: tokens } = await admin.from("make_up_tokens").select("id").eq("source_session_id", sessions[2]);
    const tokenIds = (tokens ?? []).map((row) => row.id as string);

    const { error } = await coach.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: morningIn(5).toISOString(),
      p_token_ids: tokenIds,
    });
    expect(error?.message).toContain("on hold");
  });

  it("a coach books a make-up for their own lesson only when the setting allows it", async () => {
    const { data: tokens } = await admin.from("make_up_tokens").select("id").eq("source_session_id", sessions[2]);
    const tokenIds = (tokens ?? []).map((row) => row.id as string);

    await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", unpaidInvoiceId);
    await setSetting("coach_propose_make_up", 0);
    const refused = await coach.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: morningIn(5).toISOString(),
      p_token_ids: tokenIds,
    });
    expect(refused.error?.message).toContain("You cannot book");

    await setSetting("coach_propose_make_up", 1);
    const { error } = await coach.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: morningIn(5).toISOString(),
      p_token_ids: tokenIds,
    });
    expect(error).toBeNull();
  });

  it("a family with no sessions left cannot be marked as attending, but absence is still recorded", async () => {
    await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", unpaidInvoiceId);
    const { data: period } = await admin
      .from("student_packages")
      .select("id, sessions_total, carried_in")
      .eq("student_id", childId)
      .order("ends_on", { ascending: false })
      .limit(1)
      .single();
    await admin
      .from("student_packages")
      .update({ sessions_used: (period?.sessions_total ?? 0) + (period?.carried_in ?? 0) })
      .eq("id", period?.id as string);
    await admin
      .from("sessions")
      .update({ starts_at: todayAt(14).toISOString(), ends_at: new Date(todayAt(14).getTime() + 60 * minute).toISOString() })
      .eq("id", sessions[3]);

    const present = await coach.client.from("attendance").upsert(
      [{ session_id: sessions[3], student_id: childId, status: "present", excused: false }],
      { onConflict: "session_id,student_id" },
    );
    expect(present.error?.message).toContain("No sessions left");

    const absent = await coach.client.from("attendance").upsert(
      [{ session_id: sessions[3], student_id: childId, status: "absent", reason: "Unwell", excused: true }],
      { onConflict: "session_id,student_id" },
    );
    expect(absent.error).toBeNull();
  });
});
