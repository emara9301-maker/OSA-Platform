import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for report tests");
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
    user_metadata: { age: "30", username: `${name}_${runId}` },
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

describe("daily reports", () => {
  let owner: Account;
  let coach: Account;
  let otherCoach: Account;
  let parent: Account;
  let sessionId: string;
  let childId: string;
  let skillId: string;
  let beginnerTwoId: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    otherCoach = await account("other", "coach");
    parent = await account("parent", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Reports ${runId}`, address: "7 Jalan Test", pool_hours: "7-7", contact_phone: "+60155555555" })
      .select("id")
      .single();
    condoIds.push(condo?.id as string);

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: beginner2 } = await owner.client.from("levels").select("id").eq("name", "Beginner 2").single();
    beginnerTwoId = beginner2?.id as string;

    const { data: skill } = await owner.client
      .from("skills")
      .select("id")
      .eq("level_id", level?.id)
      .eq("name", "Front float")
      .single();
    skillId = skill?.id as string;

    const { data: klass } = await owner.client
      .from("classes")
      .insert({
        name: `Reports class ${runId}`,
        condo_id: condo?.id,
        coach_id: coach.id,
        level_id: level?.id,
        weekday: 2,
        start_time: "17:00",
        duration_minutes: 45,
        capacity: 4,
        start_date: "2026-11-01",
        end_date: "2026-11-08",
      })
      .select("id")
      .single();

    const { data: session } = await owner.client
      .from("sessions")
      .select("id")
      .eq("class_id", klass?.id)
      .order("starts_at")
      .limit(1)
      .single();
    sessionId = session?.id as string;

    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Reported ${runId}`, date_of_birth: "2017-01-01", condo_id: condo?.id })
      .select("id")
      .single();
    childId = child?.id as string;
    await admin.from("class_enrolments").insert({ class_id: klass?.id, student_id: childId });

    const { data: family } = await admin.from("families").insert({ name: `Reports family ${runId}` }).select("id").single();
    await admin.from("students").update({ family_id: family?.id }).eq("id", childId);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "Mother" });
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of condoIds) {
      await admin.from("classes").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("the class coach writes a report with skill progress", async () => {
    const { data, error } = await coach.client
      .from("reports")
      .upsert(
        { session_id: sessionId, student_id: childId, attitude: 4, effort: 5, water_confidence: 3, problems: ["late"] },
        { onConflict: "session_id,student_id" },
      )
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) {
      throw new Error("report not saved");
    }

    const { error: skillError } = await coach.client
      .from("report_skills")
      .insert({ report_id: data.id, skill_id: skillId, progress_percent: 50 });
    expect(skillError).toBeNull();
  });

  it("ratings and problems outside their lists are refused", async () => {
    const { error: ratingError } = await coach.client
      .from("reports")
      .update({ attitude: 9 })
      .eq("session_id", sessionId)
      .eq("student_id", childId);
    const { error: problemError } = await coach.client
      .from("reports")
      .update({ problems: ["unknown"] })
      .eq("session_id", sessionId)
      .eq("student_id", childId);
    expect(ratingError).not.toBeNull();
    expect(problemError).not.toBeNull();
  });

  it("another coach cannot write a report for this class", async () => {
    const { error } = await otherCoach.client
      .from("reports")
      .update({ effort: 1 })
      .eq("session_id", sessionId)
      .eq("student_id", childId);
    const { data } = await otherCoach.client.from("reports").select("id").eq("session_id", sessionId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("the parent sees the report, but not the internal note", async () => {
    const { data: report } = await coach.client
      .from("report_internal_notes")
      .upsert({ report_id: (await coach.client.from("reports").select("id").eq("session_id", sessionId).single()).data?.id, note: "Needs reassurance about the steps" });
    expect(report).toBeNull();

    const { data: asParent } = await parent.client.from("reports").select("attitude, effort").eq("student_id", childId);
    const { data: noteAsParent } = await parent.client.from("report_internal_notes").select("note");
    const { data: noteAsCoach } = await coach.client.from("report_internal_notes").select("note");

    expect(asParent).toEqual([{ attitude: 4, effort: 5 }]);
    expect(noteAsParent).toEqual([]);
    expect(noteAsCoach).toHaveLength(1);
  });

  it("the coach moves the student to the next level, and another coach cannot", async () => {
    const { error: otherError } = await otherCoach.client.rpc("move_student_level", {
      p_session: sessionId,
      p_student: childId,
      p_level_id: beginnerTwoId,
    });
    expect(otherError).not.toBeNull();

    const { error } = await coach.client.rpc("move_student_level", {
      p_session: sessionId,
      p_student: childId,
      p_level_id: beginnerTwoId,
    });
    expect(error).toBeNull();

    const { data: student } = await admin.from("students").select("current_level").eq("id", childId).single();
    expect(student?.current_level).toBe("Beginner 2");
  });

  it("report changes are recorded in the audit log", async () => {
    const { data } = await owner.client
      .from("audit_log")
      .select("actor_id")
      .eq("table_name", "reports")
      .eq("action", "insert")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(data?.[0].actor_id).toBe(coach.id);
  });
});
