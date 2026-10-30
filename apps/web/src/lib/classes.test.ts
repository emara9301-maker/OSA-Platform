import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for class tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];

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

const classBase = {
  class_type: "group",
  start_time: "17:00",
  duration_minutes: 45,
  start_date: "2026-11-01",
  end_date: "2026-11-30",
};

describe("classes and sessions", () => {
  let owner: Account;
  let coach: Account;
  let otherCoach: Account;
  let student: Account;
  let condoId: string;
  let levelId: string;
  let classId: string;
  let studentRecordId: string;
  let secondStudentRecordId: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    otherCoach = await account("other", "coach");
    student = await account("student", "student");

    const { data: condo, error: condoError } = await owner.client
      .from("condos")
      .insert({ name: `Classes ${runId}`, address: "5 Jalan Test", pool_hours: "7-7", contact_phone: "+60133333333" })
      .select("id")
      .single();
    if (condoError || !condo) {
      throw new Error(condoError?.message ?? "condo not created");
    }
    condoId = condo.id;
    condoIds.push(condoId);

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    levelId = level?.id as string;

    const { data: first } = await admin
      .from("students")
      .insert({ full_name: `Pupil A ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId })
      .select("id")
      .single();
    studentRecordId = first?.id as string;

    const { data: second } = await admin
      .from("students")
      .insert({ full_name: `Pupil B ${runId}`, date_of_birth: "2017-02-02", condo_id: condoId })
      .select("id")
      .single();
    secondStudentRecordId = second?.id as string;
  });

  afterAll(async () => {
    await admin.from("classes").delete().in("condo_id", condoIds);
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of condoIds) {
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("six starter levels exist, and staff can read them", async () => {
    const { data } = await coach.client.from("levels").select("name").order("sort_order");
    expect(data?.map((row) => row.name)).toEqual([
      "Water Confidence",
      "Beginner 1",
      "Beginner 2",
      "Intermediate 1",
      "Intermediate 2",
      "Advanced",
    ]);
  });

  it("a weekly class creates one session per matching weekday in its date range", async () => {
    // Tuesdays between 1 and 30 November 2026: 3, 10, 17 and 24.
    const { data, error } = await owner.client
      .from("classes")
      .insert({ ...classBase, name: `Tuesday ${runId}`, condo_id: condoId, coach_id: coach.id, level_id: levelId, weekday: 2, capacity: 1 })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) {
      throw new Error("class not created");
    }
    classId = data.id;

    const { data: sessions } = await owner.client.from("sessions").select("id, status").eq("class_id", classId);
    expect(sessions).toHaveLength(4);
    expect(sessions?.every((row) => row.status === "scheduled")).toBe(true);
  });

  it("a 17:00 Malaysian lesson is stored at 09:00 UTC on its own day", async () => {
    const { data } = await owner.client.from("sessions").select("starts_at").eq("class_id", classId).limit(1).single();
    const start = new Date(data?.starts_at as string);
    expect(start.getUTCHours()).toBe(9);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCDay()).toBe(2);
  });

  it("changing the weekday regenerates the future sessions on the new day", async () => {
    // Wednesdays between 1 and 30 November 2026: 4, 11, 18 and 25.
    const { error } = await owner.client.from("classes").update({ weekday: 3 }).eq("id", classId);
    expect(error).toBeNull();

    const { data: sessions } = await owner.client.from("sessions").select("starts_at").eq("class_id", classId);
    expect(sessions).toHaveLength(4);
    expect(sessions?.every((row) => new Date(row.starts_at).getUTCDay() !== 2)).toBe(true);
  });

  it("the coach sees the sessions of their own class, and another coach sees nothing", async () => {
    const { data: own } = await coach.client.from("sessions").select("id").eq("class_id", classId);
    const { data: other } = await otherCoach.client.from("sessions").select("id").eq("class_id", classId);
    expect(own?.length).toBe(4);
    expect(other).toEqual([]);
  });

  it("a class cannot take more students than its capacity", async () => {
    const { error: first } = await owner.client
      .from("class_enrolments")
      .insert({ class_id: classId, student_id: studentRecordId });
    const { error: second } = await owner.client
      .from("class_enrolments")
      .insert({ class_id: classId, student_id: secondStudentRecordId });

    expect(first).toBeNull();
    expect(second?.message).toContain("This class is full");
  });

  it("a coach sees an enrolled student without a direct assignment", async () => {
    const { data: asCoach } = await coach.client.from("students").select("id").eq("id", studentRecordId);
    const { data: asOther } = await otherCoach.client.from("students").select("id").eq("id", studentRecordId);
    expect(asCoach).toEqual([{ id: studentRecordId }]);
    expect(asOther).toEqual([]);
  });

  it("the owner cancels one session with a reason, and it is audited", async () => {
    const { data: rows } = await owner.client
      .from("sessions")
      .select("id")
      .eq("class_id", classId)
      .eq("status", "scheduled")
      .limit(1);
    const sessionId = rows?.[0].id as string;

    const { error } = await owner.client.rpc("cancel_session_for_reason", {
      p_session_id: sessionId,
      p_kind: "holiday",
      p_reason: "Public holiday",
    });
    expect(error).toBeNull();

    const { data: log } = await owner.client
      .from("audit_log")
      .select("actor_id, after_data")
      .eq("table_name", "sessions")
      .eq("action", "update")
      .eq("record_id", sessionId);
    expect(log?.[0].actor_id).toBe(owner.id);
    expect(log?.[0].after_data).toMatchObject({ status: "cancelled" });
  });

  it("a coach cannot cancel a session, and a student sees no classes or sessions", async () => {
    const { data: rows } = await owner.client
      .from("sessions")
      .select("id")
      .eq("class_id", classId)
      .eq("status", "scheduled")
      .limit(1);
    const sessionId = rows?.[0].id as string;

    const { error: coachError } = await coach.client
      .from("sessions")
      .update({ status: "cancelled" })
      .eq("id", sessionId)
      .select("id");
    const { data: studentClasses } = await student.client.from("classes").select("id");
    const { data: studentSessions } = await student.client.from("sessions").select("id");

    expect(coachError).not.toBeNull();
    expect(studentClasses).toEqual([]);
    expect(studentSessions).toEqual([]);
  });

  it("a coach cannot create a class", async () => {
    const { error } = await coach.client
      .from("classes")
      .insert({ ...classBase, name: "Nope", condo_id: condoId, coach_id: coach.id, level_id: levelId, weekday: 1, capacity: 5 });
    expect(error).not.toBeNull();
  });

  it("a guardian sees the class and lessons of their child, and not of other children", async () => {
    const parent = await account("guardian", "student");
    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({ name: `Family ${runId}` })
      .select("id")
      .single();
    if (familyError || !family) {
      throw new Error(familyError?.message ?? "family not created");
    }
    await admin.from("family_guardians").insert({ family_id: family.id, profile_id: parent.id, relationship: "Father" });
    await admin.from("students").update({ family_id: family.id }).eq("id", studentRecordId);

    const { data: classes } = await parent.client.from("classes").select("id");
    const { data: sessions } = await parent.client.from("sessions").select("id").eq("class_id", classId);
    const { data: other } = await parent.client.from("students").select("id").eq("id", secondStudentRecordId);

    expect(classes?.map((row) => row.id)).toEqual([classId]);
    expect(sessions?.length).toBeGreaterThan(0);
    expect(other).toEqual([]);

    await admin.from("students").update({ family_id: null }).eq("id", studentRecordId);
    await admin.from("families").delete().eq("id", family.id);
  });
  it("managers add a level at the end of the list, and coaches cannot", async () => {
    const levelName = `Test level ${runId}`;
    const { error: coachError } = await coach.client.from("levels").insert({ name: `${levelName} coach`, sort_order: 99 });
    expect(coachError).not.toBeNull();

    const { data: last } = await owner.client.from("levels").select("sort_order").order("sort_order", { ascending: false }).limit(1).single();
    const { error } = await owner.client.from("levels").insert({ name: levelName, sort_order: (last?.sort_order ?? 0) + 1 });
    expect(error).toBeNull();

    const { data: added } = await owner.client.from("levels").select("id").eq("name", levelName).single();
    await admin.from("levels").delete().eq("id", added?.id as string);
  });
});
