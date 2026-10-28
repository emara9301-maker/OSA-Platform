import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for billing tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];
const familyIds: string[] = [];
const packageIds: string[] = [];

const minute = 60 * 1000;

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

// Malaysian date of today as YYYY-MM-DD.
function todayInMalaysia(): string {
  return new Date(Date.now() + 8 * 60 * minute).toISOString().slice(0, 10);
}

// A time today in Malaysia (the packages start today, so lessons placed today fall inside them).
function todayAt(hour: number, minutes = 0): Date {
  const local = new Date(Date.now() + 8 * 60 * minute);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - 8, minutes));
}

async function placeLesson(sessionId: string, startsAt: Date) {
  const { error } = await admin
    .from("sessions")
    .update({ starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + 60 * minute).toISOString() })
    .eq("id", sessionId);
  if (error) {
    throw new Error(error.message);
  }
}

describe("billing, packages and deductions", () => {
  let owner: Account;
  let coach: Account;
  let parent: Account;
  let condoId: string;
  let packageId: string;
  let childA: string;
  let childB: string;
  let sessions: string[];

  async function usedSessions(studentId: string) {
    const { data } = await admin
      .from("student_packages")
      .select("sessions_total, carried_in, sessions_used, starts_on, ends_on")
      .eq("student_id", studentId)
      .order("starts_on");
    return data ?? [];
  }

  // The period that covers today, which is where a lesson today is deducted from.
  async function currentPeriod(studentId: string) {
    const today = todayInMalaysia();
    const { data } = await admin
      .from("student_packages")
      .select("sessions_used, starts_on, ends_on")
      .eq("student_id", studentId)
      .lte("starts_on", today)
      .gte("ends_on", today)
      .order("ends_on")
      .limit(1)
      .single();
    return data as { sessions_used: number; starts_on: string; ends_on: string };
  }

  async function invoiceFor(studentId: string) {
    const { data } = await admin
      .from("invoices")
      .select("id, amount, discount_percent, status, due_on")
      .eq("student_id", studentId)
      .order("created_at");
    return data ?? [];
  }

  beforeAll(async () => {
    owner = await account("owner", "owner");
    coach = await account("coach", "coach");
    parent = await account("parent", "student");

    const { data: condo, error: condoError } = await owner.client
      .from("condos")
      .insert({ name: `Billing ${runId}`, address: "8 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444" })
      .select("id")
      .single();
    if (condoError || !condo) {
      throw new Error(condoError?.message ?? "condo not created");
    }
    condoId = condo.id;
    condoIds.push(condoId);

    const { data: pkg, error: pkgError } = await owner.client
      .from("packages")
      .insert({
        name: `Billing package ${runId}`,
        type: "small_group",
        sessions_count: 4,
        session_minutes: 60,
        price: 200,
        validity_days: 30,
        is_active: true,
      })
      .select("id")
      .single();
    if (pkgError || !pkg) {
      throw new Error(pkgError?.message ?? "package not created");
    }
    packageId = pkg.id;
    packageIds.push(packageId);

    const { data: family } = await admin.from("families").insert({ name: `Billing family ${runId}` }).select("id").single();
    familyIds.push(family?.id as string);
    await admin.from("family_guardians").insert({ family_id: family?.id, profile_id: parent.id, relationship: "mother" });

    const { data: level } = await owner.client.from("levels").select("id").eq("name", "Beginner 1").single();
    const { data: klass, error: classError } = await owner.client
      .from("classes")
      .insert({
        name: `Billing class ${runId}`,
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

    const { data: upcoming } = await admin
      .from("sessions")
      .select("id")
      .eq("class_id", klass.id)
      .order("starts_at")
      .limit(8);
    sessions = (upcoming ?? []).map((row) => row.id as string);

    const { data: a } = await admin
      .from("students")
      .insert({ full_name: `Child A ${runId}`, date_of_birth: "2017-01-01", condo_id: condoId, family_id: family?.id })
      .select("id")
      .single();
    const { data: b } = await admin
      .from("students")
      .insert({ full_name: `Child B ${runId}`, date_of_birth: "2018-01-01", condo_id: condoId, family_id: family?.id })
      .select("id")
      .single();
    childA = a?.id as string;
    childB = b?.id as string;
    await admin.from("class_enrolments").insert([
      { class_id: klass.id, student_id: childA },
      { class_id: klass.id, student_id: childB },
    ]);
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
    for (const id of packageIds) {
      await admin.from("packages").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("the first child pays full price, and a sibling of an active child gets 20% off", async () => {
    const { data: first, error } = await owner.client.rpc("create_invoice", {
      p_student_id: childA,
      p_package_id: packageId,
    });
    expect(error).toBeNull();
    const [invoiceA] = await invoiceFor(childA);
    expect(Number(invoiceA.amount)).toBe(200);
    expect(first).toBe(invoiceA.id);

    await owner.client.rpc("record_payment", { p_invoice_id: invoiceA.id, p_gateway: "mock", p_gateway_ref: "MOCK-A1" });

    await owner.client.rpc("create_invoice", { p_student_id: childB, p_package_id: packageId });
    const [invoiceB] = await invoiceFor(childB);
    expect(Number(invoiceB.amount)).toBe(160);
    expect(Number(invoiceB.discount_percent)).toBe(20);
  });

  it("a paid invoice starts a 30-day package with the package's sessions", async () => {
    const [invoiceB] = await invoiceFor(childB);
    await owner.client.rpc("record_payment", { p_invoice_id: invoiceB.id, p_gateway: "mock", p_gateway_ref: "MOCK-B1" });

    const [packageA] = await usedSessions(childA);
    expect(packageA.sessions_total).toBe(4);
    expect(packageA.starts_on).toBe(todayInMalaysia());
    const days = (new Date(packageA.ends_on).getTime() - new Date(packageA.starts_on).getTime()) / (24 * 60 * minute);
    expect(days).toBe(29);
  });

  it("attendance deducts a session; an unexcused absence is deducted, an excused one is not", async () => {
    await placeLesson(sessions[0], todayAt(12));
    const { error } = await coach.client.from("attendance").upsert(
      [
        { session_id: sessions[0], student_id: childA, status: "present", excused: false },
        { session_id: sessions[0], student_id: childB, status: "absent", reason: "Unwell", excused: false },
      ],
      { onConflict: "session_id,student_id" },
    );
    expect(error).toBeNull();
    expect((await usedSessions(childA))[0].sessions_used).toBe(1);
    expect((await usedSessions(childB))[0].sessions_used).toBe(1);

    await placeLesson(sessions[1], todayAt(13));
    await coach.client.from("attendance").upsert(
      [{ session_id: sessions[1], student_id: childA, status: "absent", reason: "School trip", excused: true }],
      { onConflict: "session_id,student_id" },
    );
    expect((await usedSessions(childA))[0].sessions_used).toBe(1);
  });

  it("a rain-counted lesson deducts each student once, and attendance does not deduct it again", async () => {
    await placeLesson(sessions[2], new Date(Date.now() - 40 * minute));
    const { data } = await coach.client.rpc("start_weather_hold", { p_session_id: sessions[2] });
    expect(data).toBe("counted");

    const afterRain = (await usedSessions(childA))[0].sessions_used;
    expect(afterRain).toBe(2);
    expect((await usedSessions(childB))[0].sessions_used).toBe(2);

    await coach.client.from("attendance").upsert(
      [{ session_id: sessions[2], student_id: childA, status: "present" }],
      { onConflict: "session_id,student_id" },
    );
    expect((await usedSessions(childA))[0].sessions_used).toBe(afterRain);
  });

  it("unused sessions carry over to the next period, unless the invoice says otherwise", async () => {
    const [period] = await usedSessions(childA);
    const yesterday = new Date(Date.now() + 8 * 60 * minute - 24 * 60 * minute).toISOString().slice(0, 10);
    const { error: endError } = await admin
      .from("student_packages")
      .update({ starts_on: yesterday, ends_on: yesterday })
      .eq("student_id", childA)
      .eq("starts_on", period.starts_on);
    expect(endError).toBeNull();

    await owner.client.rpc("create_invoice", { p_student_id: childA, p_package_id: packageId });
    const invoices = await invoiceFor(childA);
    await owner.client.rpc("record_payment", {
      p_invoice_id: invoices[invoices.length - 1].id,
      p_gateway: "mock",
      p_gateway_ref: "MOCK-A2",
    });
    const carried = (await usedSessions(childA)).at(-1);
    expect(carried?.carried_in).toBe(2);

    await owner.client.rpc("create_invoice", { p_student_id: childA, p_package_id: packageId, p_carry_over: false });
    const forfeit = await invoiceFor(childA);
    await owner.client.rpc("record_payment", {
      p_invoice_id: forfeit[forfeit.length - 1].id,
      p_gateway: "mock",
      p_gateway_ref: "MOCK-A3",
    });
    expect((await usedSessions(childA)).at(-1)?.carried_in).toBe(0);
  });

  it("an unpaid invoice past the hold day puts the family on hold, a grace period lifts it, and a coach sees Overdue only", async () => {
    await owner.client.rpc("create_invoice", { p_student_id: childB, p_package_id: packageId });
    const invoices = await invoiceFor(childB);
    const unpaid = invoices.find((i) => i.status === "unpaid");
    expect(unpaid).toBeDefined();
    const holdDay = new Date(Date.now() + 8 * 60 * minute - 37 * 24 * 60 * minute).toISOString().slice(0, 10);
    await admin.from("invoices").update({ due_on: holdDay }).eq("id", unpaid?.id as string);

    const { data: onHold } = await owner.client.rpc("student_payment_status", { p_student_id: childB });
    expect(onHold).toBe("on_hold");
    const { data: coachView } = await coach.client.rpc("student_payment_status", { p_student_id: childB });
    expect(coachView).toBe("overdue");

    const { data: coachInvoices } = await coach.client.from("invoices").select("id").eq("student_id", childB);
    expect(coachInvoices).toEqual([]);
    const { data: parentInvoices } = await parent.client.from("invoices").select("id").eq("student_id", childB);
    expect((parentInvoices ?? []).length).toBeGreaterThan(0);

    const until = new Date(Date.now() + 8 * 60 * minute + 5 * 24 * 60 * minute).toISOString().slice(0, 10);
    await owner.client.rpc("set_payment_grace", { p_student_id: childB, p_until: until });
    const { data: graced } = await owner.client.rpc("student_payment_status", { p_student_id: childB });
    expect(graced).toBe("overdue");
  });

  it("attendance on a lesson cancelled for a holiday reverses the cancellation, voids its tokens, and alerts operations", async () => {
    await placeLesson(sessions[3], todayAt(15));
    const { data } = await owner.client.rpc("cancel_session_for_reason", {
      p_session_id: sessions[3],
      p_kind: "holiday",
      p_reason: "Public holiday",
    });
    expect(data).toBe("cancelled");
    const before = (await currentPeriod(childA)).sessions_used;

    await coach.client.from("attendance").upsert(
      [{ session_id: sessions[3], student_id: childA, status: "present" }],
      { onConflict: "session_id,student_id" },
    );

    const { data: session } = await admin.from("sessions").select("status").eq("id", sessions[3]).single();
    expect(session?.status).toBe("done");
    const { data: tokens } = await admin.from("make_up_tokens").select("status").eq("source_session_id", sessions[3]);
    expect(tokens?.every((t) => t.status === "void")).toBe(true);
    const { data: alerts } = await admin.from("operation_alerts").select("body").eq("session_id", sessions[3]);
    expect(alerts?.[0].body).toContain("Attendance was marked on a cancelled lesson");
    expect((await currentPeriod(childA)).sessions_used).toBe(before + 1);
  });

  it("renewal invoices and reminders are created for a package that ends soon", async () => {
    const [period] = await usedSessions(childB);
    const soon = new Date(Date.now() + 8 * 60 * minute + 3 * 24 * 60 * minute).toISOString().slice(0, 10);
    await admin.from("student_packages").update({ ends_on: soon }).eq("student_id", childB).eq("starts_on", period.starts_on);

    const { error } = await owner.client.rpc("generate_billing");
    expect(error).toBeNull();

    const renewals = (await invoiceFor(childB)).filter((i) => i.due_on === soon);
    expect(renewals).toHaveLength(1);

    const { data: messages } = await admin
      .from("outbound_messages")
      .select("body")
      .eq("recipient_id", parent.id)
      .like("body", "Renewal of RM%");
    expect((messages ?? []).length).toBeGreaterThan(0);
  });
});
