import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for public site tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);
const visitor = createClient(url, key, options);

const runId = Math.random().toString(36).slice(2, 8);
const hiddenName = `Hidden package ${runId}`;

describe("public site", () => {
  let parent: SupabaseClient;
  let stranger: SupabaseClient;
  let condoId: string;
  let trialId: string;
  let poolId: string;
  let childId: string;
  const userIds: string[] = [];

  async function signedIn(name: string): Promise<{ id: string; client: SupabaseClient }> {
    const email = `${name}.${runId}@osa.test`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: "test-pass-123",
      email_confirm: true,
      user_metadata: { age: "30", date_of_birth: "1996-01-01", username: `${name}_${runId}` },
    });
    userIds.push(data.user?.id as string);
    const client = createClient(url, key, options);
    await client.auth.signInWithPassword({ email, password: "test-pass-123" });
    return { id: data.user?.id as string, client };
  }

  beforeAll(async () => {
    const { data: condo } = await admin
      .from("condos")
      .insert({ name: `Public ${runId}`, address: "1 Jalan Test", pool_hours: "7am-10pm", contact_phone: "+60144444444", area: "Mont Kiara" })
      .select("id")
      .single();
    condoId = condo?.id as string;
    const { data: trial } = await admin
      .from("packages")
      .insert({ condo_id: condoId, name: `Trial: buy ${runId}`, type: "small_group", sessions_count: 8, session_minutes: 60, price: 200, is_active: true })
      .select("id")
      .single();
    trialId = trial?.id as string;
    const { data: pool } = await admin.from("pools").select("id").eq("condo_id", condoId).single();
    poolId = pool?.id as string;
    parent = (await signedIn("buyer")).client;
    stranger = (await signedIn("stranger")).client;
  });

  afterAll(async () => {
    await admin.from("students").delete().eq("condo_id", condoId);
    await admin.from("packages").delete().eq("id", trialId);
    await admin.from("packages").delete().eq("name", hiddenName);
    await admin.from("condos").delete().eq("id", condoId);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a visitor sees the pools that are ready", async () => {
    const { data, error } = await visitor.rpc("public_condos");
    expect(error).toBeNull();
    expect((data ?? []).some((c: { id: string }) => c.id === condoId)).toBe(true);
  });

  it("a parent registers a child and buys a package, which creates an invoice to pay", async () => {
    const pkg = { id: trialId };
    const { data: registered, error } = await parent.rpc("register_child", {
      p_full_name: `Public child ${runId}`,
      p_date_of_birth: "2017-05-05",
      p_pool_id: poolId,
    });
    expect(error).toBeNull();
    childId = registered as string;

    const { data: invoiceId, error: buyError } = await parent.rpc("buy_package", {
      p_student_id: childId,
      p_package_id: pkg?.id,
    });
    expect(buyError).toBeNull();
    const { data: invoice } = await admin.from("invoices").select("status, student_id").eq("id", invoiceId as string).single();
    expect(invoice).toEqual({ status: "unpaid", student_id: childId });
  });

  it("a signed-in parent sees the active packages to buy", async () => {
    const { data, error } = await parent.from("packages").select("name").eq("id", trialId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("a stranger cannot buy a package for someone else's child", async () => {
    const pkg = { id: trialId };
    const { error } = await stranger.rpc("buy_package", { p_student_id: childId, p_package_id: pkg?.id });
    expect(error?.message).toContain("You cannot buy a package for this child.");
  });


  it("a visitor sees the active trial packages", async () => {
    const { data, error } = await visitor.from("packages").select("name, price").eq("id", trialId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("a visitor does not see inactive packages", async () => {
    await admin.from("packages").insert({
      condo_id: condoId,
      name: hiddenName,
      type: "adult",
      sessions_count: 4,
      session_minutes: 60,
      price: 100,
      is_active: false,
    });
    const { data } = await visitor.from("packages").select("name").eq("name", hiddenName);
    expect(data).toEqual([]);
  });

  it("a visitor cannot read invoices, students or settings", async () => {
    const { data: invoices } = await visitor.from("invoices").select("id");
    const { data: students } = await visitor.from("students").select("id");
    const { data: settings } = await visitor.from("settings").select("key");
    // Denied access returns no rows (null), and filtered access returns an empty list.
    expect(invoices ?? []).toEqual([]);
    expect(students ?? []).toEqual([]);
    expect(settings ?? []).toEqual([]);
  });
});
