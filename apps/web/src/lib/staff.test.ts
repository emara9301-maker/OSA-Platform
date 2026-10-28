import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseConfig } from "./supabase";
import type { AccountRole } from "./staff";

const { url, key } = supabaseConfig();
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required for account tests");
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = Math.random().toString(36).slice(2, 8);
const createdUserIds: string[] = [];

type Account = { id: string; email: string };

async function createAccount(name: string, role: AccountRole = "student"): Promise<Account> {
  const email = `${name}.${runId}@osa.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { age: "30", username: `${name.replace(/-/g, "_")}_${runId}` },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "user not created");
  }

  createdUserIds.push(data.user.id);
  if (role !== "student") {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", data.user.id);
    if (roleError) {
      throw new Error(roleError.message);
    }
  }

  return { id: data.user.id, email };
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw new Error(error?.message ?? "no link token");
  }

  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) {
    throw new Error(verifyError.message);
  }

  return client;
}

async function setRole(client: SupabaseClient, target: Account, role: AccountRole) {
  return client.rpc("set_account_role", { target_id: target.id, new_role: role });
}

describe("accounts and roles", () => {
  let owner: Account;
  let headCoach: Account;
  let deptHeadA: Account;
  let deptHeadB: Account;
  let coach: Account;
  let student: Account;

  beforeAll(async () => {
    owner = await createAccount("owner", "owner");
    headCoach = await createAccount("head-coach", "head_coach");
    deptHeadA = await createAccount("dept-a", "department_head");
    deptHeadB = await createAccount("dept-b", "department_head");
    coach = await createAccount("coach", "coach");
    student = await createAccount("student");
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("shows nothing to an anonymous visitor", async () => {
    const anon = createClient(url, key, { auth: { persistSession: false } });

    const { data, error } = await anon.from("profiles").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("gives every new account the student role", async () => {
    const { data } = await admin.from("profiles").select("role").eq("id", student.id).single();

    expect(data?.role).toBe("student");
  });

  it("lets a student read only their own profile", async () => {
    const client = await signedInClient(student.email);

    const { data, error } = await client.from("profiles").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: student.id }]);
  });

  it("lets the owner set a coach role, then the coach sees only their own profile", async () => {
    const ownerClient = await signedInClient(owner.email);

    const { error } = await setRole(ownerClient, coach, "coach");
    expect(error).toBeNull();

    const coachClient = await signedInClient(coach.email);
    const { data } = await coachClient.from("profiles").select("id");
    expect(data).toEqual([{ id: coach.id }]);
  });

  it("lets a department head set sales, but not another department head", async () => {
    const deptClient = await signedInClient(deptHeadA.email);

    const sales = await setRole(deptClient, student, "sales");
    expect(sales.error).toBeNull();

    const otherDept = await setRole(deptClient, deptHeadB, "student");
    expect(otherDept.error).not.toBeNull();

    const { data } = await admin.from("profiles").select("role").eq("id", deptHeadB.id).single();
    expect(data?.role).toBe("department_head");
  });

  it("lets a head coach set coach or student, but not sales", async () => {
    const headClient = await signedInClient(headCoach.email);
    const newStudent = await createAccount("new-student");

    const coachOk = await setRole(headClient, newStudent, "coach");
    expect(coachOk.error).toBeNull();

    const salesDenied = await setRole(headClient, newStudent, "sales");
    expect(salesDenied.error).not.toBeNull();
  });

  it("stops a coach from assigning any role", async () => {
    const coachClient = await signedInClient(coach.email);

    const { error } = await setRole(coachClient, student, "student");

    expect(error).not.toBeNull();
  });

  it("stops anyone from changing their own role with a direct update", async () => {
    const client = await signedInClient(student.email);

    await client.from("profiles").update({ role: "owner" }).eq("id", student.id);

    const { data } = await admin.from("profiles").select("role").eq("id", student.id).single();
    expect(data?.role).not.toBe("owner");
  });
});
