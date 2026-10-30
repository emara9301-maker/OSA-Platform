import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for rain tests");
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

// Moves a lesson to a time that suits the test. The lesson is 60 minutes long.
async function placeLesson(sessionId: string, startsAt: Date) {
  const { error } = await admin
    .from("sessions")
    .update({ starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + 60 * minute).toISOString() })
    .eq("id", sessionId);
  if (error) {
    throw new Error(error.message);
  }
}

// A time on a given day at 11:13 in Malaysia, away from the 17:00 lessons of the test class.
function morningIn(days: number): Date {
  const local = new Date(Date.now() + days * day + 8 * 60 * minute);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3, 13));
}


// A paid package with plenty of sessions, so the student may be marked as attending.
async function grantPackage(owner: { id: string; client: SupabaseClient }, studentId: string, poolId: string) {
  const { data: pkg } = await owner.client
    .from("packages")
    .insert({ condo_id: poolId, name: `Attend package ${runId} ${studentId.slice(0, 6)}`, type: "small_group", sessions_count: 50, session_minutes: 60, price: 100, is_active: true })
    .select("id")
    .single();
  const { data: invoiceId } = await owner.client.rpc("create_invoice", { p_student_id: studentId, p_package_id: pkg?.id });
  await admin.rpc("apply_payment", { p_invoice_id: invoiceId, p_gateway: "mock", p_gateway_ref: `MOCK-${studentId.slice(0, 8)}`, p_recorded_by: owner.id });
  await admin.from("student_packages").update({ ends_on: "2030-12-31" }).eq("student_id", studentId);
}

describe("rain holds, cancellations and make-up lessons", () => {
  let owner: Account;
  let coach: Account;
  let otherCoach: Account;
  let parent: Account;
  let classId: string;
  let sessions: string[];
  let studentIds: string[];
  let condoId: string;

  async function tokensFor(sessionId: string) {
    const { data } = await admin
      .from("make_up_tokens")
      .select("student_id, status, reason, expires_at, make_up_session_id")
      .eq("source_session_id", sessionId);
    return data ?? [];
  }

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    otherCoach = await account("other", "coach");
    parent = await account("parent", "student");

    const { data: condo, error: condoError } = await owner.client
      .from("condos")
      .insert({ name: `Rain ${runId}`, address: "7 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444" })
      .select("id")
      .single();
    if (condoError || !condo) {
      throw new Error(condoError?.message ?? "condo not created");
    }
    condoId = condo.id;
    condoIds.push(condoId);

    const { data: family } = await admin.from("families").insert({ name: `Rain family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: klass, error: classError } = await owner.client
      .from("classes")
      .insert({
        name: `Rain class ${runId}`,
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
    if (classError || !klass) {
      throw new Error(classError?.message ?? "class not created");
    }
    classId = klass.id;

    const { data: upcoming } = await admin
      .from("sessions")
      .select("id")
      .eq("class_id", classId)
      .order("starts_at")
      .limit(6);
    sessions = (upcoming ?? []).map((row) => row.id as string);

    const names = ["Rain one", "Rain two"];
    studentIds = [];
    for (const name of names) {
      const { data: student } = await admin
        .from("students")
        .insert({ full_name: `${name} ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, family_id: family?.id })
        .select("id")
        .single();
      studentIds.push(student?.id as string);
      await admin.from("class_enrolments").insert({ class_id: classId, student_id: student?.id, });
      await grantPackage(owner, student?.id as string, condoId);
    }
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

  it("a weather hold pauses the lesson and tells the family", async () => {
    await placeLesson(sessions[0], new Date(Date.now() - 10 * minute));

    const { data, error } = await coach.client.rpc("start_weather_hold", { p_session_id: sessions[0] });
    expect(error).toBeNull();
    expect(data).toBe("paused");

    const { data: row } = await admin.from("sessions").select("status").eq("id", sessions[0]).single();
    expect(row?.status).toBe("paused");

    const { data: messages } = await admin
      .from("outbound_messages")
      .select("recipient_id, body")
      .eq("session_id", sessions[0]);
    expect(messages).toEqual([
      expect.objectContaining({
        recipient_id: parent.id,
        body: "Class paused for thunder, we will update you in 30 minutes",
      }),
    ]);
  });

  it("the class resumes only 30 minutes after the last thunder", async () => {
    const early = await coach.client.rpc("resume_weather_hold", { p_session_id: sessions[0] });
    expect(early.error?.message).toContain("30 minutes after the last thunder");

    const thunder = await coach.client.rpc("record_thunder", { p_session_id: sessions[0] });
    expect(thunder.data).toBe("paused");

    await admin
      .from("sessions")
      .update({ last_thunder_at: new Date(Date.now() - 31 * minute).toISOString() })
      .eq("id", sessions[0]);
    const resumed = await coach.client.rpc("resume_weather_hold", { p_session_id: sessions[0] });
    expect(resumed.data).toBe("resumed");

    const { data: row } = await admin.from("sessions").select("status").eq("id", sessions[0]).single();
    expect(row?.status).toBe("scheduled");
  });

  it("a pause that starts after the middle of the lesson counts it as a session", async () => {
    await placeLesson(sessions[1], new Date(Date.now() - 40 * minute));

    const { data } = await coach.client.rpc("start_weather_hold", { p_session_id: sessions[1] });
    expect(data).toBe("counted");

    const { data: row } = await admin.from("sessions").select("status, rain_stopped").eq("id", sessions[1]).single();
    expect(row).toEqual({ status: "done", rain_stopped: true });
    expect(await tokensFor(sessions[1])).toEqual([]);
  });

  it("a short rain stop cancels the lesson, gives each student a token, and pays the coach RM 20", async () => {
    await placeLesson(sessions[2], new Date(Date.now() - 10 * minute));
    await coach.client.rpc("start_weather_hold", { p_session_id: sessions[2] });

    const { data } = await coach.client.rpc("cancel_weather_hold", { p_session_id: sessions[2] });
    expect(data).toBe("cancelled");

    const { data: row } = await admin
      .from("sessions")
      .select("status, cancel_kind, coach_pay_rm")
      .eq("id", sessions[2])
      .single();
    expect(row).toEqual({ status: "cancelled", cancel_kind: "rain", coach_pay_rm: 20 });

    const tokens = await tokensFor(sessions[2]);
    expect(tokens.map((t) => t.status).sort()).toEqual(["open", "open"]);
    expect(tokens.every((t) => t.reason === "rain")).toBe(true);
    const days = (new Date(tokens[0].expires_at).getTime() - Date.now()) / day;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
  });

  it("a pause still running at the middle of the lesson is ended by the settle job", async () => {
    await placeLesson(sessions[3], new Date(Date.now() - 10 * minute));
    await coach.client.rpc("start_weather_hold", { p_session_id: sessions[3] });

    // Time has passed the middle of the lesson while the class was still on hold.
    await admin
      .from("sessions")
      .update({
        starts_at: new Date(Date.now() - 35 * minute).toISOString(),
        ends_at: new Date(Date.now() + 25 * minute).toISOString(),
      })
      .eq("id", sessions[3]);
    const { error } = await owner.client.rpc("settle_weather_holds");
    expect(error).toBeNull();

    const { data: row } = await admin.from("sessions").select("status").eq("id", sessions[3]).single();
    expect(row?.status).toBe("cancelled");
    expect((await tokensFor(sessions[3])).length).toBe(2);
  });

  it("a holiday cancels the lesson with tokens but no coach pay", async () => {
    const { data } = await owner.client.rpc("cancel_session_for_reason", {
      p_session_id: sessions[4],
      p_kind: "holiday",
      p_reason: "Public holiday",
    });
    expect(data).toBe("cancelled");

    const { data: row } = await admin.from("sessions").select("coach_pay_rm").eq("id", sessions[4]).single();
    expect(row?.coach_pay_rm).toBeNull();
    const tokens = await tokensFor(sessions[4]);
    expect(tokens.length).toBe(2);
    expect(tokens.every((t) => t.reason === "holiday")).toBe(true);
  });

  it("a make-up needs notice, then books the group in one slot", async () => {
    const tokenRows = await tokensFor(sessions[2]);
    const { data: ids } = await admin
      .from("make_up_tokens")
      .select("id")
      .eq("source_session_id", sessions[2]);
    const tokenIds = (ids ?? []).map((row) => row.id as string);

    const tooSoon = await owner.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: new Date(Date.now() + 60 * minute).toISOString(),
      p_token_ids: tokenIds,
    });
    expect(tooSoon.error?.message).toContain("6 hours notice");

    const slot = morningIn(3);
    const { data: makeUpId, error } = await owner.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: slot.toISOString(),
      p_token_ids: tokenIds,
    });
    expect(error).toBeNull();
    expect(tokenRows.length).toBe(2);

    const { data: makeUp } = await admin.from("sessions").select("is_make_up, starts_at").eq("id", makeUpId).single();
    expect(makeUp?.is_make_up).toBe(true);
    expect(new Date(makeUp?.starts_at as string).getTime()).toBe(slot.getTime());

    const booked = await tokensFor(sessions[2]);
    expect(booked.every((t) => t.status === "booked" && t.make_up_session_id === makeUpId)).toBe(true);
  });

  it("a make-up that clashes with the coach's lesson needs operations approval", async () => {
    const { data: ids } = await admin.from("make_up_tokens").select("id").eq("source_session_id", sessions[3]);
    const tokenIds = (ids ?? []).map((row) => row.id as string);

    const slot = morningIn(4);
    await admin.from("sessions").insert({
      class_id: classId,
      starts_at: new Date(slot.getTime() + 30 * minute).toISOString(),
      ends_at: new Date(slot.getTime() + 90 * minute).toISOString(),
    });

    const blocked = await owner.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: slot.toISOString(),
      p_token_ids: tokenIds,
    });
    expect(blocked.error?.message).toContain("Operations must approve");

    const { data: makeUpId, error } = await owner.client.rpc("schedule_make_up", {
      p_class_id: classId,
      p_starts_at: slot.toISOString(),
      p_token_ids: tokenIds,
      p_ops_approved: true,
    });
    expect(error).toBeNull();
    const { data: makeUp } = await admin.from("sessions").select("ops_approved").eq("id", makeUpId).single();
    expect(makeUp?.ops_approved).toBe(true);
  });

  it("marking a student in a make-up uses that student's token", async () => {
    const { data: makeUpRow } = await admin
      .from("sessions")
      .select("id")
      .eq("class_id", classId)
      .eq("is_make_up", true)
      .order("starts_at")
      .limit(1)
      .single();
    const makeUpId = makeUpRow?.id as string;

    const { error } = await coach.client.from("attendance").upsert(
      [
        { session_id: makeUpId, student_id: studentIds[0], status: "present" },
        { session_id: makeUpId, student_id: studentIds[1], status: "absent", reason: "Unwell" },
      ],
      { onConflict: "session_id,student_id" },
    );
    expect(error).toBeNull();

    const tokens = await tokensFor(sessions[2]);
    expect(tokens.every((t) => t.status === "used")).toBe(true);
  });

  it("families see their children's tokens, and another coach sees none", async () => {
    const { data: asParent } = await parent.client
      .from("make_up_tokens")
      .select("student_id")
      .eq("source_session_id", sessions[4]);
    expect(asParent).toHaveLength(2);

    const { data: asOther } = await otherCoach.client
      .from("make_up_tokens")
      .select("id")
      .eq("source_session_id", sessions[4]);
    expect(asOther).toEqual([]);

    const otherHold = await otherCoach.client.rpc("start_weather_hold", { p_session_id: sessions[5] });
    expect(otherHold.error?.message).toContain("You cannot change this lesson.");
  });
});
