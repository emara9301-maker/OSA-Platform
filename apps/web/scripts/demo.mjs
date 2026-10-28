// Local demo data for viewing and testing. Every demo record is named with "[DEMO]".
// Usage (from apps/web): npm run demo:seed   or   npm run demo:remove
// Refuses to run against anything but the local Supabase.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error("Demo data only runs against the local Supabase.");
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const mode = process.argv[2];

const accounts = [
  {
    email: "demo.coach@osa.local",
    password: "demo-coach-123",
    username: "demo_coach",
    full_name: "[DEMO] Coach Lee",
    age: 30,
    role: "coach",
  },
  {
    email: "demo.parent@osa.local",
    password: "demo-parent-123",
    username: "demo_parent",
    full_name: "[DEMO] Parent Tan",
    date_of_birth: "1985-04-10",
    phone: "+60123400001",
    role: "student",
  },
];

const condos = [
  { name: "[DEMO] Sunrise Condo", area: "Kuala Lumpur", address: "1 Jalan Demo, Kuala Lumpur", latitude: 3.1412, longitude: 101.6865, pool_hours: "7am to 9pm", contact_phone: "+60123400010" },
  { name: "[DEMO] Lakeview Condo", area: "Petaling Jaya", address: "2 Jalan Demo, Petaling Jaya", latitude: 3.1073, longitude: 101.6067, pool_hours: "8am to 8pm", contact_phone: "+60123400011" },
];

const packages = [
  { name: "[DEMO] Private 1:1, 12 sessions", type: "private_1_1", sessions_count: 12, session_minutes: 45, price: 1200, short_pitch: "One coach, one child" },
  { name: "[DEMO] Small group, 8 sessions", type: "small_group", sessions_count: 8, session_minutes: 60, price: 480, short_pitch: "Up to four children" },
  { name: "[DEMO] Adult group, 8 sessions", type: "adult", sessions_count: 8, session_minutes: 60, price: 560, short_pitch: "Adults only" },
];

const family = "[DEMO] Tan family";

async function profileIdByUsername(username) {
  const { data } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  return data?.id ?? null;
}

async function seed() {
  // Accounts
  const ids = {};
  for (const account of accounts) {
    let id = await profileIdByUsername(account.username);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: {
          username: account.username,
          full_name: account.full_name,
          age: account.age,
          date_of_birth: account.date_of_birth,
          phone: account.phone,
        },
      });
      if (error) throw new Error(`${account.email}: ${error.message}`);
      id = data.user.id;
    }
    if (account.role !== "student") {
      await admin.from("profiles").update({ role: account.role }).eq("id", id);
    }
    ids[account.username] = id;
  }

  // Condos
  const condoIds = {};
  for (const condo of condos) {
    const { data: existing } = await admin.from("condos").select("id").eq("name", condo.name).maybeSingle();
    if (existing) {
      condoIds[condo.name] = existing.id;
    } else {
      const { data, error } = await admin.from("condos").insert(condo).select("id").single();
      if (error) throw new Error(error.message);
      condoIds[condo.name] = data.id;
    }
  }

  // Packages
  for (const item of packages) {
    const { data: existing } = await admin.from("packages").select("id").eq("name", item.name).maybeSingle();
    if (!existing) {
      const { error } = await admin.from("packages").insert({ ...item, validity_days: 30, is_active: true });
      if (error) throw new Error(error.message);
    }
  }

  // Family with a guardian
  let { data: fam } = await admin.from("families").select("id").eq("name", family).maybeSingle();
  if (!fam) {
    const { data, error } = await admin.from("families").insert({ name: family }).select("id").single();
    if (error) throw new Error(error.message);
    fam = data;
  }
  await admin
    .from("family_guardians")
    .upsert({ family_id: fam.id, profile_id: ids["demo_parent"], relationship: "Mother" }, { onConflict: "family_id,profile_id" });

  // Children
  const sunrise = condoIds["[DEMO] Sunrise Condo"];
  const children = [
    { full_name: "[DEMO] Aisha Tan", date_of_birth: "2017-03-12", status: "active", start_level: "Water Confidence", current_level: "Beginner 1", family_id: fam.id, condo_id: sunrise, medical_notes: "[DEMO] None known", photo_consent: true, data_consent: true },
    { full_name: "[DEMO] Ben Tan", date_of_birth: "2019-07-20", status: "trial", start_level: "Water Confidence", family_id: fam.id, condo_id: sunrise, data_consent: true },
    { full_name: "[DEMO] Chen Wei", date_of_birth: "2016-11-05", status: "lead", condo_id: condoIds["[DEMO] Lakeview Condo"] },
  ];
  for (const child of children) {
    const { data: existing } = await admin.from("students").select("id").eq("full_name", child.full_name).maybeSingle();
    if (existing) continue;
    const { data, error } = await admin.from("students").insert(child).select("id").single();
    if (error) throw new Error(error.message);
    if (child.full_name === "[DEMO] Aisha Tan") {
      await admin.from("student_coaches").insert({ student_id: data.id, coach_id: ids["demo_coach"] });
    }
  }

  // A weekly class for the demo children, with Aisha and Ben enrolled.
  const { data: level } = await admin.from("levels").select("id").eq("name", "Beginner 1").single();
  let { data: demoClass } = await admin.from("classes").select("id").eq("name", "[DEMO] Tuesday Beginner 1").maybeSingle();
  if (!demoClass) {
    const { data, error } = await admin
      .from("classes")
      .insert({
        name: "[DEMO] Tuesday Beginner 1",
        condo_id: sunrise,
        coach_id: ids["demo_coach"],
        level_id: level.id,
        class_type: "group",
        weekday: 2,
        start_time: "17:00",
        duration_minutes: 45,
        capacity: 4,
        start_date: "2026-11-01",
        end_date: "2026-12-31",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    demoClass = data;
    const { data: kids } = await admin.from("students").select("id, full_name").in("full_name", ["[DEMO] Aisha Tan", "[DEMO] Ben Tan"]);
    await admin.from("class_enrolments").insert(kids.map((kid) => ({ class_id: demoClass.id, student_id: kid.id })));
  }

  console.log("Demo data is ready.");
  console.log("Coach:  demo.coach@osa.local / demo-coach-123");
  console.log("Parent: demo.parent@osa.local / demo-parent-123");
}

async function remove() {
  const { data: demoStudents } = await admin.from("students").select("id").like("full_name", "[DEMO]%");
  const accountIds = [];
  for (const account of accounts) {
    const id = await profileIdByUsername(account.username);
    if (id) accountIds.push(id);
  }
  const { data: ownRecords } = await admin.from("students").select("id").in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);

  const studentIds = [...(demoStudents ?? []), ...(ownRecords ?? [])].map((row) => row.id);
  if (studentIds.length) await admin.from("students").delete().in("id", studentIds);

  await admin.from("classes").delete().like("name", "[DEMO]%");
  await admin.from("families").delete().like("name", "[DEMO]%");
  await admin.from("packages").delete().like("name", "[DEMO]%");
  await admin.from("condos").delete().like("name", "[DEMO]%");
  for (const id of accountIds) {
    await admin.auth.admin.deleteUser(id);
  }
  console.log("Demo data removed. Audit log entries are kept.");
}

if (mode === "seed") {
  await seed();
} else if (mode === "remove") {
  await remove();
} else {
  console.log("Usage: node scripts/demo.mjs seed | remove");
  process.exitCode = 1;
}
