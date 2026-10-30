import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for student tests");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, options);

const runId = Math.random().toString(36).slice(2, 8);
const password = "test-pass-123";
const userIds: string[] = [];
const condoIds: string[] = [];
const familyIds: string[] = [];

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

describe("families and students", () => {
  let owner: Account;
  let coach: Account;
  let parent: Account;
  let otherParent: Account;
  let adult: Account;
  let loner: Account;
  let condoId: string;
  let familyId: string;
  let childId: string;
  let secondChildId: string;

  beforeAll(async () => {
    owner = await accountWithRole("owner", "owner");
    coach = await accountWithRole("coach", "coach");
    parent = await accountWithRole("parent", "student");
    otherParent = await accountWithRole("other", "student");
    adult = await accountWithRole("adult", "student");
    loner = await accountWithRole("loner", "student");

    const { data: condo, error } = await owner.client
      .from("condos")
      .insert({ name: `Students ${runId}`, address: "3 Jalan Test", pool_hours: "7-7", contact_phone: "+60111111111" })
      .select("id")
      .single();
    if (error || !condo) {
      throw new Error(error?.message ?? "condo not created");
    }
    condoId = condo.id;
    condoIds.push(condoId);
  });

  afterAll(async () => {
    await admin.from("students").delete().in("condo_id", condoIds);
    for (const id of familyIds) {
      await admin.from("families").delete().eq("id", id);
    }
    for (const id of condoIds) {
      await admin.from("condos").delete().eq("id", id);
    }
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("the owner creates a family and a child in it", async () => {
    const { data: family, error } = await owner.client
      .from("families")
      .insert({ name: `Family ${runId}` })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!family) {
      throw new Error("family not created");
    }
    familyId = family.id;
    familyIds.push(familyId);

    const { data: child, error: childError } = await owner.client
      .from("students")
      .insert({
        full_name: "Child One",
        date_of_birth: "2018-05-01",
        condo_id: condoId,
        family_id: familyId,
      })
      .select("id, status, qr_token")
      .single();
    expect(childError).toBeNull();
    if (!child) {
      throw new Error("student not created");
    }
    childId = child.id;
    expect(child.status).toBe("lead");
    expect(child.qr_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("every student gets a different QR code", async () => {
    const { data, error } = await owner.client
      .from("students")
      .insert({ full_name: "Child Two", date_of_birth: "2019-01-01", condo_id: condoId, family_id: familyId })
      .select("id, qr_token")
      .single();
    expect(error).toBeNull();
    if (!data) {
      throw new Error("student not created");
    }
    secondChildId = data.id;

    const { data: first } = await owner.client.from("students").select("qr_token").eq("id", childId).single();
    expect(first?.qr_token).not.toBe(data.qr_token);
  });

  it("a coach sees no students until staff assign them", async () => {
    const { data: before } = await coach.client.from("students").select("id");
    expect(before).toEqual([]);

    const { error } = await owner.client.from("student_coaches").insert({ student_id: childId, coach_id: coach.id });
    expect(error).toBeNull();

    const { data: after } = await coach.client.from("students").select("id");
    expect(after?.map((row) => row.id)).toEqual([childId]);
  });

  it("a coach cannot edit a student or assign coaches", async () => {
    const { data: edited } = await coach.client
      .from("students")
      .update({ full_name: "Hacked" })
      .eq("id", childId)
      .select("id");
    const { error: assignError } = await coach.client
      .from("student_coaches")
      .insert({ student_id: childId, coach_id: parent.id });

    expect(edited).toEqual([]);
    expect(assignError).not.toBeNull();
  });

  it("a guardian sees every child in the family, and nobody else's", async () => {
    const { error } = await owner.client
      .from("family_guardians")
      .insert({ family_id: familyId, profile_id: parent.id, relationship: "Mother" });
    expect(error).toBeNull();

    const { data: asParent } = await parent.client.from("students").select("id");
    const { data: asOther } = await otherParent.client.from("students").select("id");

    expect(asParent?.map((row) => row.id).sort()).toEqual([childId, secondChildId].sort());
    expect(asOther).toEqual([]);
  });

  it("a guardian cannot link other guardians", async () => {
    const { error } = await parent.client
      .from("family_guardians")
      .insert({ family_id: familyId, profile_id: otherParent.id, relationship: "Helper" });
    expect(error).not.toBeNull();
  });

  it("an adult student sees only their own record once linked", async () => {
    const { data: adultStudent, error } = await owner.client
      .from("students")
      .insert({ full_name: "Adult", date_of_birth: "1990-03-03", condo_id: condoId, account_id: adult.id })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!adultStudent) {
      throw new Error("student not created");
    }

    const { data: asAdult } = await adult.client.from("students").select("id");
    const { data: asLoner } = await loner.client.from("students").select("id");
    expect(asAdult?.map((row) => row.id)).toEqual([adultStudent.id]);
    expect(asLoner).toEqual([]);
  });

  it("a student account cannot add students or families", async () => {
    const { error: studentError } = await parent.client
      .from("students")
      .insert({ full_name: "Nope", date_of_birth: "2010-01-01", condo_id: condoId });
    const { error: familyError } = await parent.client.from("families").insert({ name: "Nope" });
    expect(studentError).not.toBeNull();
    expect(familyError).not.toBeNull();
  });

  it("students and families cannot be deleted", async () => {
    const { error: studentError } = await owner.client.from("students").delete().eq("id", childId);
    const { error: familyError } = await owner.client.from("families").delete().eq("id", familyId);
    expect(studentError).not.toBeNull();
    expect(familyError).not.toBeNull();
  });

  it("changes to a student are recorded in the audit log", async () => {
    const { error } = await owner.client.from("students").update({ status: "active" }).eq("id", childId);
    expect(error).toBeNull();

    const { data } = await owner.client
      .from("audit_log")
      .select("actor_id, before_data, after_data")
      .eq("table_name", "students")
      .eq("record_id", childId)
      .eq("action", "update")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(data?.[0].actor_id).toBe(owner.id);
    expect(data?.[0].before_data).toMatchObject({ status: "lead" });
    expect(data?.[0].after_data).toMatchObject({ status: "active" });
  });

  it("family and coach links are recorded in the audit log", async () => {
    const { data } = await owner.client
      .from("audit_log")
      .select("table_name")
      .eq("record_id", familyId)
      .eq("table_name", "family_guardians");
    expect(data?.length).toBeGreaterThan(0);

    const { data: coachLog } = await owner.client
      .from("audit_log")
      .select("table_name")
      .eq("record_id", childId)
      .eq("table_name", "student_coaches");
    expect(coachLog?.length).toBeGreaterThan(0);
  });
});
