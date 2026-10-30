import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for attendance tests");
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

describe("attendance and incidents", () => {
  let owner: Account;
  let coach: Account;
  let otherCoach: Account;
  let condoId: string;
  let sessionId: string;
  let enrolledId: string;
  let notEnrolledId: string;
  let incidentId: string;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    otherCoach = await account("other", "coach");

    const { data: condo, error: condoError } = await owner.client
      .from("condos")
      .insert({ name: `Attend ${runId}`, address: "6 Jalan Test", pool_hours: "7-7", contact_phone: "+60144444444" })
      .select("id")
      .single();
    if (condoError || !condo) {
      throw new Error(condoError?.message ?? "condo not created");
    }
    condoId = condo.id;
    condoIds.push(condoId);

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: klass, error: classError } = await owner.client
      .from("classes")
      .insert({
        name: `Attend class ${runId}`,
        condo_id: condoId,
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
    if (classError || !klass) {
      throw new Error(classError?.message ?? "class not created");
    }

    const { data: session } = await owner.client
      .from("sessions")
      .select("id")
      .eq("class_id", klass.id)
      .order("starts_at")
      .limit(1)
      .single();
    sessionId = session?.id as string;

    const { data: enrolled } = await admin
      .from("students")
      .insert({ full_name: `Enrolled ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId })
      .select("id")
      .single();
    enrolledId = enrolled?.id as string;
    const { data: outsider } = await admin
      .from("students")
      .insert({ full_name: `Outsider ${runId}`, date_of_birth: "2017-02-02", condo_id: condoId })
      .select("id")
      .single();
    notEnrolledId = outsider?.id as string;

    await admin.from("class_enrolments").insert({ class_id: klass.id, student_id: enrolledId });
    await grantPackage(owner, enrolledId, condoId);
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    await admin.from("incidents").delete().in("condo_id", condoIds);
    for (const id of condoIds) {
      await admin.from("classes").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("the class coach marks a student late, and it is saved", async () => {
    const { error } = await coach.client
      .from("attendance")
      .upsert({ session_id: sessionId, student_id: enrolledId, status: "late" }, { onConflict: "session_id,student_id" });
    expect(error).toBeNull();

    const { data } = await coach.client.from("attendance").select("status, marked_by").eq("session_id", sessionId);
    expect(data).toEqual([{ status: "late", marked_by: coach.id }]);
  });

  it("an absence needs a reason", async () => {
    const { error } = await coach.client
      .from("attendance")
      .upsert({ session_id: sessionId, student_id: enrolledId, status: "absent" }, { onConflict: "session_id,student_id" });
    expect(error).not.toBeNull();
  });

  it("another coach cannot mark attendance for this class", async () => {
    const { error } = await otherCoach.client
      .from("attendance")
      .upsert({ session_id: sessionId, student_id: enrolledId, status: "present" }, { onConflict: "session_id,student_id" });
    expect(error).not.toBeNull();
  });

  it("a student who is not enrolled in the class cannot be marked", async () => {
    const { error } = await coach.client
      .from("attendance")
      .insert({ session_id: sessionId, student_id: notEnrolledId, status: "present" });
    expect(error?.message).toContain("not enrolled");
  });

  it("attendance changes are recorded in the audit log", async () => {
    const { data } = await owner.client
      .from("audit_log")
      .select("actor_id, after_data")
      .eq("table_name", "attendance")
      .eq("record_id", enrolledId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(data?.[0].actor_id).toBe(coach.id);
    expect(data?.[0].after_data).toMatchObject({ status: "late" });
  });

  it("a coach reports an incident, and sees only their own reports", async () => {
    const { data, error } = await coach.client
      .from("incidents")
      .insert({
        condo_id: condoId,
        student_id: enrolledId,
        incident_type: "pool_hazard",
        severity: "medium",
        description: `Loose tile near the steps ${runId}`,
      })
      .select("id, reported_by")
      .single();
    expect(error).toBeNull();
    if (!data) {
      throw new Error("incident not created");
    }
    incidentId = data.id;
    expect(data.reported_by).toBe(coach.id);

    const { data: mine } = await coach.client.from("incidents").select("id").eq("id", incidentId);
    const { data: theirs } = await otherCoach.client.from("incidents").select("id").eq("id", incidentId);
    expect(mine).toHaveLength(1);
    expect(theirs).toEqual([]);
  });

  it("only managers close an incident", async () => {
    const { data: byCoach } = await coach.client
      .from("incidents")
      .update({ status: "closed" })
      .eq("id", incidentId)
      .select("id");
    expect(byCoach).toEqual([]);

    const { data: byOwner } = await owner.client
      .from("incidents")
      .update({ status: "closed" })
      .eq("id", incidentId)
      .select("status");
    expect(byOwner).toEqual([{ status: "closed" }]);
  });
});
