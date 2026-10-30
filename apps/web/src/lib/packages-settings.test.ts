import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for package tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const packageIds: string[] = [];

type Account = { id: string; client: SupabaseClient };

async function accountWithRole(name: string, role: AccountRole): Promise<Account> {
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

const completePackage = {
  name: "Test Package",
  type: "private_1_1",
  sessions_count: 12,
  session_minutes: 45,
  price: 1200,
};

describe("packages and settings", () => {
  let owner: Account;
  let departmentHead: Account;
  let coach: Account;
  let student: Account;
  let packageId: string;
  let poolId: string;

  beforeAll(async () => {
    // Earlier runs may have left settings changed; put the defaults back first.
    await admin.from("settings").update({ value: 20 }).eq("key", "sibling_discount_percent");
    await admin.from("settings").update({ value: 50 }).eq("key", "rain_delivered_percent");

    owner = await accountWithRole("owner", "owner");
    departmentHead = await accountWithRole("head", "department_head");
    coach = await accountWithRole("coach", "coach");
    student = await accountWithRole("student", "student");
    const { data: pool } = await admin
      .from("condos")
      .insert({ name: `Pool ${runId}`, address: "1 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444" })
      .select("id")
      .single();
    poolId = pool?.id as string;
  });

  afterAll(async () => {
    for (const id of packageIds) {
      await admin.from("packages").delete().eq("id", id);
    }
    await admin.from("condos").delete().eq("id", poolId);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("the owner adds a package; validity defaults to 30 days and price per session is computed", async () => {
    const { data, error } = await owner.client
      .from("packages")
      .insert({ ...completePackage, condo_id: poolId, name: `Owner ${runId}` })
      .select("id, validity_days, price_per_session, is_active, created_by")
      .single();

    expect(error).toBeNull();
    if (!data) {
      throw new Error("package not created");
    }
    packageIds.push(data.id);
    packageId = data.id;
    expect(data.validity_days).toBe(30);
    expect(data.price_per_session).toBe(100);
    expect(data.is_active).toBe(true);
    expect(data.created_by).toBe(owner.id);
  });

  it("a package with an age range that is backwards is rejected", async () => {
    const { error } = await owner.client
      .from("packages")
      .insert({ ...completePackage, condo_id: poolId, name: "Bad ages", age_min: 10, age_max: 5 });
    expect(error).not.toBeNull();
  });

  it("a package without a price is allowed until OSA sends prices", async () => {
    const { data, error } = await owner.client
      .from("packages")
      .insert({ ...completePackage, condo_id: poolId, name: `No price ${runId}`, price: null })
      .select("id, price_per_session")
      .single();

    expect(error).toBeNull();
    if (!data) {
      throw new Error("package not created");
    }
    packageIds.push(data.id);
    expect(data.price_per_session).toBeNull();
  });

  it("a department head adds, edits and deletes packages", async () => {
    const { data, error } = await departmentHead.client
      .from("packages")
      .insert({ ...completePackage, condo_id: poolId, name: `Head ${runId}` })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) {
      throw new Error("package not created");
    }
    packageIds.push(data.id);

    const { error: updateError } = await departmentHead.client
      .from("packages")
      .update({ is_active: false })
      .eq("id", data.id);
    expect(updateError).toBeNull();

    const { data: deleted, error: deleteError } = await departmentHead.client
      .from("packages")
      .delete()
      .eq("id", data.id)
      .select("id");
    expect(deleteError).toBeNull();
    expect(deleted).toHaveLength(1);
    packageIds.splice(packageIds.indexOf(data.id), 1);

    const { data: log } = await owner.client
      .from("audit_log")
      .select("actor_id, before_data")
      .eq("table_name", "packages")
      .eq("record_id", data.id)
      .eq("action", "delete");
    expect(log).toHaveLength(1);
    expect(log?.[0].actor_id).toBe(departmentHead.id);
    expect(log?.[0].before_data).toMatchObject({ name: `Head ${runId}` });
  });

  it("the owner deletes a package", async () => {
    const { data: created } = await owner.client
      .from("packages")
      .insert({ ...completePackage, condo_id: poolId, name: `Owner delete ${runId}` })
      .select("id")
      .single();
    if (!created) {
      throw new Error("package not created");
    }

    const { data: deleted, error } = await owner.client
      .from("packages")
      .delete()
      .eq("id", created.id)
      .select("id");
    expect(error).toBeNull();
    expect(deleted).toHaveLength(1);
  });

  it("a coach sees no packages, a student sees only active ones, and neither can add one", async () => {
    const { data: asCoach } = await coach.client.from("packages").select("id");
    const { data: asStudent } = await student.client.from("packages").select("id, is_active");
    const { error: insertError } = await coach.client.from("packages").insert({ ...completePackage, condo_id: poolId, name: "Nope" });

    expect(asCoach).toEqual([]);
    expect((asStudent ?? []).every((row) => row.is_active === true)).toBe(true);
    expect(insertError).not.toBeNull();
  });

  it("a package change is recorded in the audit log", async () => {
    const { error } = await owner.client.from("packages").update({ badge: "new" }).eq("id", packageId);
    expect(error).toBeNull();

    const { data } = await owner.client
      .from("audit_log")
      .select("before_data, after_data, actor_id")
      .eq("table_name", "packages")
      .eq("record_id", packageId)
      .eq("action", "update");

    expect(data?.[0].actor_id).toBe(owner.id);
    expect(data?.[0].before_data).toMatchObject({ badge: null });
    expect(data?.[0].after_data).toMatchObject({ badge: "new" });
  });

  it("the owner uploads a package photo; a coach cannot", async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const ownerPath = `test-${runId}-owner.png`;
    const coachPath = `test-${runId}-coach.png`;

    const { error: ownerError } = await owner.client.storage
      .from("package-images")
      .upload(ownerPath, png, { contentType: "image/png" });
    const { error: coachError } = await coach.client.storage
      .from("package-images")
      .upload(coachPath, png, { contentType: "image/png" });

    expect(ownerError).toBeNull();
    expect(coachError).not.toBeNull();

    await admin.storage.from("package-images").remove([ownerPath]);
  });

  it("the package photo bucket refuses files that are not images", async () => {
    const text = new Blob(["not an image"], { type: "text/plain" });
    const { error } = await owner.client.storage
      .from("package-images")
      .upload(`test-${runId}.txt`, text, { contentType: "text/plain" });
    expect(error).not.toBeNull();
  });

  it("the owner sees the default settings; a coach does not", async () => {
    const { data: asOwner } = await owner.client
      .from("settings")
      .select("key, value")
      .eq("key", "sibling_discount_percent");
    const { data: asCoach } = await coach.client.from("settings").select("key");

    expect(asOwner).toEqual([{ key: "sibling_discount_percent", value: 20 }]);
    expect(asCoach).toEqual([]);
  });

  it("a department head changes a setting, and the change is recorded", async () => {
    try {
      const { error } = await departmentHead.client
        .from("settings")
        .update({ value: 60 })
        .eq("key", "rain_delivered_percent");
      expect(error).toBeNull();

      const { data } = await owner.client
        .from("audit_log")
        .select("before_data, after_data, actor_id")
        .eq("table_name", "settings")
        .eq("record_id", "rain_delivered_percent")
        .eq("actor_id", departmentHead.id)
        .order("created_at", { ascending: false })
        .limit(1);

      expect(data).toHaveLength(1);
      expect(data?.[0].actor_id).toBe(departmentHead.id);
      expect(data?.[0].before_data).toMatchObject({ value: 50 });
      expect(data?.[0].after_data).toMatchObject({ value: 60 });
    } finally {
      await admin.from("settings").update({ value: 50 }).eq("key", "rain_delivered_percent");
    }
  });

  it("a setting cannot be negative", async () => {
    const { error } = await owner.client.from("settings").update({ value: -5 }).eq("key", "overdue_hold_day");
    expect(error).not.toBeNull();
  });

  it("settings cannot be added or deleted from the app", async () => {
    const { error: insertError } = await owner.client
      .from("settings")
      .insert({ key: `extra_${runId}`, value: 1, label: "x", unit: "x" });
    const { error: deleteError } = await owner.client.from("settings").delete().eq("key", "overdue_hold_day");

    expect(insertError).not.toBeNull();
    expect(deleteError).not.toBeNull();
  });
});

describe("numbers in settings reach the staff screens", () => {
  it("a change to a staff-visible number is read by staff, and money settings stay hidden from coaches", async () => {
    const owner = await accountWithRole("owner", "owner");
    const coach = await accountWithRole("coach", "coach");

    const { data: before } = await coach.client.rpc("staff_setting", { p_key: "schedule_window_days" });
    expect(before).toBe(14);

    const { error: changeError } = await owner.client
      .from("settings")
      .update({ value: 21 })
      .eq("key", "schedule_window_days");
    expect(changeError).toBeNull();
    const { data: after } = await coach.client.rpc("staff_setting", { p_key: "schedule_window_days" });
    expect(after).toBe(21);

    await owner.client.from("settings").update({ value: 14 }).eq("key", "schedule_window_days");
    const { error: hidden } = await coach.client.rpc("staff_setting", { p_key: "sibling_discount_percent" });
    expect(hidden?.message).toContain("not available to staff");
  });
});

