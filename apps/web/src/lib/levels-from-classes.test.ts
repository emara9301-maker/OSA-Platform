import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for level tests");
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const condoIds: string[] = [];
const userIds: string[] = [];
const packageIds: string[] = [];

const minute = 60 * 1000;

// Today in Malaysia as the calendar date (yyyy-mm-dd).
function todayInMalaysia(): string {
  return new Date(Date.now() + 8 * 60 * minute).toISOString().slice(0, 10);
}

describe("start level, current level and start date come from the classes", () => {
  let owner: { id: string; client: SupabaseClient };
  let studentId: string;
  let classId: string;
  let sessionId: string;
  let levelName: string;
  let packageId: string;

  beforeAll(async () => {
    const { data: ownerUser } = await admin.auth.admin.createUser({
      email: `level-owner.${runId}@osa.test`,
      password,
      email_confirm: true,
      user_metadata: { age: "30", date_of_birth: "1990-01-01", username: `level_owner_${runId}` },
    });
    userIds.push(ownerUser.user?.id as string);
    await admin.from("profiles").update({ role: "owner" }).eq("id", ownerUser.user?.id as string);
    const ownerClient = createClient(url, key, options);
    await ownerClient.auth.signInWithPassword({ email: `level-owner.${runId}@osa.test`, password });
    owner = { id: ownerUser.user?.id as string, client: ownerClient };

    const { data: coachUser } = await admin.auth.admin.createUser({
      email: `level-coach.${runId}@osa.test`,
      password,
      email_confirm: true,
      user_metadata: { age: "30", date_of_birth: "1990-01-01", username: `level_coach_${runId}` },
    });
    userIds.push(coachUser.user?.id as string);
    await admin.from("profiles").update({ role: "coach" }).eq("id", coachUser.user?.id as string);

    const { data: condo } = await admin
      .from("condos")
      .insert({ name: `Level condo ${runId}`, address: "6 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60188888888" })
      .select("id")
      .single();
    const condoId = condo?.id as string;
    condoIds.push(condoId);
    const { data: pool } = await admin.from("pools").select("id").eq("condo_id", condoId).single();

    const { data: level } = await admin.from("levels").select("id, name").limit(1).single();
    levelName = level?.name as string;

    const { data: cls } = await admin
      .from("classes")
      .insert({ name: `Level class ${runId}`, condo_id: condoId, pool_id: pool?.id, coach_id: coachUser.user?.id, level_id: level?.id, class_type: "group", weekday: 1, start_time: "10:00", duration_minutes: 60, capacity: 5, start_date: "2026-01-01", end_date: "2030-12-31" })
      .select("id")
      .single();
    classId = cls?.id as string;

    // The class creates its weekly sessions; one of them is moved to today so a paid package covers it.
    const { data: session } = await admin.from("sessions").select("id").eq("class_id", classId).limit(1).single();
    sessionId = session?.id as string;
    const startsAt = new Date(`${todayInMalaysia()}T10:00:00+08:00`);
    await admin
      .from("sessions")
      .update({ starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + 60 * minute).toISOString() })
      .eq("id", sessionId);

    const { data: pkg } = await admin
      .from("packages")
      .insert({ pool_id: pool?.id, name: `Level package ${runId}`, type: "small_group", sessions_count: 4, session_minutes: 60, price: 90, is_active: true })
      .select("id")
      .single();
    packageId = pkg?.id as string;
    packageIds.push(packageId);

    const { data: student } = await admin
      .from("students")
      .insert({ full_name: `Level student ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, pool_id: pool?.id })
      .select("id")
      .single();
    studentId = student?.id as string;

    await owner.client.rpc("create_invoice", { p_student_id: studentId, p_package_id: packageId });
    const { data: invoice } = await admin.from("invoices").select("id").eq("student_id", studentId).single();
    await owner.client.rpc("record_payment", { p_invoice_id: invoice?.id, p_gateway: "mock", p_gateway_ref: `LEVEL-${runId}` });
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    await admin.from("classes").delete().in("condo_id", condoIds);
    for (const id of packageIds) {
      await admin.from("packages").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("pools").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("joining a class sets the start level and the current level to that class's level", async () => {
    const { error } = await admin.from("class_enrolments").insert({ class_id: classId, student_id: studentId });
    expect(error).toBeNull();

    const { data } = await admin.from("students").select("start_level, current_level").eq("id", studentId).single();
    expect(data?.start_level).toBe(levelName);
    expect(data?.current_level).toBe(levelName);
  });

  it("attending the first lesson sets the start date to that lesson's day in Malaysia", async () => {
    const { error } = await admin.from("attendance").insert({ session_id: sessionId, student_id: studentId, status: "present" });
    expect(error).toBeNull();

    const { data } = await admin.from("students").select("start_date").eq("id", studentId).single();
    expect(data?.start_date).toBe(todayInMalaysia());
  });
});
