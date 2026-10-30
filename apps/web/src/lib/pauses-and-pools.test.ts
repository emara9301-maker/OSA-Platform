import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for pause and pool tests");
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

function todayInMalaysia(): string {
  return new Date(Date.now() + 8 * 60 * minute).toISOString().slice(0, 10);
}

function daysFromToday(n: number): string {
  return new Date(Date.now() + 8 * 60 * minute + n * day).toISOString().slice(0, 10);
}

// A time today in Malaysia, so a lesson placed today falls inside today's package period.
function todayAt(hour: number): Date {
  const local = new Date(Date.now() + 8 * 60 * minute);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - 8, 0));
}

describe("package pauses", () => {
  let owner: Account;
  let coach: Account;
  let parent: Account;
  let condoId: string;
  let childId: string;
  let packageId: string;
  let studentPackageId: string;
  let sessionId: string;
  let pauseId: string;

  async function currentPackage() {
    const { data } = await admin
      .from("student_packages")
      .select("id, ends_on, sessions_used")
      .eq("student_id", childId)
      .order("ends_on", { ascending: false })
      .limit(1)
      .single();
    return data as { id: string; ends_on: string; sessions_used: number };
  }

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    parent = await account("parent", "student");

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Pause ${runId}`, address: "3 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444", area: "Bangsar" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);

    const { data: family } = await admin.from("families").insert({ name: `Pause family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });

    const { data: pkg } = await owner.client
      .from("packages")
      .insert({ condo_id: condoId, name: `Pause package ${runId}`, type: "small_group", sessions_count: 4, session_minutes: 60, price: 100, is_active: true })
      .select("id")
      .single();
    packageId = pkg?.id as string;

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: klass } = await owner.client
      .from("classes")
      .insert({
        name: `Pause class ${runId}`,
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

    const { data: child } = await admin
      .from("students")
      .insert({ full_name: `Pause child ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, family_id: family?.id })
      .select("id")
      .single();
    childId = child?.id as string;
    await admin.from("class_enrolments").insert({ class_id: klass?.id, student_id: childId });

    const { data: upcoming } = await admin.from("sessions").select("id").eq("class_id", klass?.id as string).order("starts_at").limit(1).single();
    sessionId = upcoming?.id as string;

    const { data: invoiceId } = await owner.client.rpc("create_invoice", { p_student_id: childId, p_package_id: packageId });
    await admin.rpc("apply_payment", { p_invoice_id: invoiceId, p_gateway: "mock", p_gateway_ref: "MOCK-PAUSE", p_recorded_by: owner.id });
    studentPackageId = (await currentPackage()).id;
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("classes").delete().eq("condo_id", id);
      await admin.from("condo_details").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    await admin.from("packages").delete().eq("id", packageId);
    await admin.from("settings").update({ value: 1 }).eq("key", "family_pause_allowed");
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a family pauses the package for a few days, and the end date moves by the pause length", async () => {
    const before = (await currentPackage()).ends_on;
    const { data, error } = await parent.client.rpc("pause_package", {
      p_student_package_id: studentPackageId,
      p_starts_on: daysFromToday(1),
      p_ends_on: daysFromToday(3),
    });
    expect(error).toBeNull();
    pauseId = data as string;

    const after = (await currentPackage()).ends_on;
    const moved = (new Date(after).getTime() - new Date(before).getTime()) / day;
    expect(moved).toBe(3);
  });

  it("a family cannot pause longer than the maximum, or over another pause", async () => {
    const tooLong = await parent.client.rpc("pause_package", {
      p_student_package_id: studentPackageId,
      p_starts_on: daysFromToday(20),
      p_ends_on: daysFromToday(40),
    });
    expect(tooLong.error?.message).toContain("at most");

    const overlap = await parent.client.rpc("pause_package", {
      p_student_package_id: studentPackageId,
      p_starts_on: daysFromToday(2),
      p_ends_on: daysFromToday(2),
    });
    expect(overlap.error?.message).toContain("already has a pause");
  });

  it("no session is taken during a pause", async () => {
    await admin
      .from("sessions")
      .update({ starts_at: todayAt(12).toISOString(), ends_at: new Date(todayAt(12).getTime() + 60 * minute).toISOString() })
      .eq("id", sessionId);
    await admin.from("package_pauses").update({ starts_on: todayInMalaysia() }).eq("id", pauseId);

    const before = (await currentPackage()).sessions_used;
    await coach.client.from("attendance").upsert(
      [{ session_id: sessionId, student_id: childId, status: "present", excused: false }],
      { onConflict: "session_id,student_id" },
    );
    expect((await currentPackage()).sessions_used).toBe(before);
  });

  it("cancelling a pause gives back the days not yet reached", async () => {
    const before = (await currentPackage()).ends_on;
    const { data: remaining, error } = await parent.client.rpc("cancel_pause", { p_pause_id: pauseId });
    expect(error).toBeNull();
    expect(Number(remaining)).toBeGreaterThanOrEqual(0);

    const after = (await currentPackage()).ends_on;
    expect((new Date(before).getTime() - new Date(after).getTime()) / day).toBe(Number(remaining));
    const { data: pauseRow } = await admin.from("package_pauses").select("status").eq("id", pauseId).single();
    expect(pauseRow?.status).toBe("cancelled");
  });

  it("when families may not pause, a family is refused, but a manager still can", async () => {
    await admin.from("settings").update({ value: 0 }).eq("key", "family_pause_allowed");
    const refused = await parent.client.rpc("pause_package", {
      p_student_package_id: studentPackageId,
      p_starts_on: daysFromToday(30),
      p_ends_on: daysFromToday(31),
    });
    expect(refused.error?.message).toContain("not open for families");

    const { error } = await owner.client.rpc("pause_package", {
      p_student_package_id: studentPackageId,
      p_starts_on: daysFromToday(30),
      p_ends_on: daysFromToday(31),
    });
    expect(error).toBeNull();
    await admin.from("settings").update({ value: 1 }).eq("key", "family_pause_allowed");
  });
});

describe("pool details for visitors", () => {
  let owner: Account;
  let condoId: string;
  let poolId: string;
  let visitor: SupabaseClient;

  beforeAll(async () => {
    owner = await account("owner", "owner");
    visitor = createClient(url, key, options);

    const { data: condo } = await owner.client
      .from("condos")
      .insert({ name: `Details ${runId}`, address: "5 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444", area: "Damansara", latitude: 3.1, longitude: 101.6, rules: "No diving" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    condoIds.push(condoId);
    const { data: pool } = await admin.from("pools").select("id").eq("condo_id", condoId).single();
    poolId = pool?.id as string;
    await admin.from("pools").update({ rules: "No diving" }).eq("id", poolId);
  });

  afterAll(async () => {
    for (const id of condoIds) {
      await admin.from("condo_details").delete().eq("condo_id", id);
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a visitor sees the switched-on details of a ready pool", async () => {
    const { data, error } = await visitor.rpc("public_pool_details", { p_pool_id: poolId });
    expect(error).toBeNull();
    const labels = (data as { fields: { label: string }[] }).fields.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["Address", "Pool hours", "Phone", "Pool rules", "Area"]));
  });

  it("a switched-off standard detail is hidden, and an added detail shows", async () => {
    await admin.from("pool_fields").update({ visible: false }).eq("key", "rules");
    await owner.client.from("condo_details").insert({ condo_id: condoId, label: "Parking", value: "Basement, level B2" });

    const { data } = await visitor.rpc("public_pool_details", { p_pool_id: poolId });
    const details = data as { fields: { label: string }[]; extras: { label: string; value: string }[] };
    expect(details.fields.map((f) => f.label)).not.toContain("Pool rules");
    expect(details.extras).toEqual([expect.objectContaining({ label: "Parking", value: "Basement, level B2" })]);

    await admin.from("pool_fields").update({ visible: true }).eq("key", "rules");
  });

  it("a pool that is not ready is not shown to visitors", async () => {
    const { data: draft } = await owner.client
      .from("condos")
      .insert({ name: `Draft ${runId}`, contact_phone: null })
      .select("id")
      .single();
    condoIds.push(draft?.id as string);
    const { data: draftPool } = await admin.from("pools").select("id").eq("condo_id", draft?.id as string).single();
    const { data } = await visitor.rpc("public_pool_details", { p_pool_id: draftPool?.id });
    expect(data).toBeNull();
  });
});
