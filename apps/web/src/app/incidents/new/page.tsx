import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createIncident } from "../actions";
import { homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function NewIncident({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { error } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data: condos } = await supabase.from("condos").select("id, name").order("name");
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  return (
    <form action={createIncident}>
      <label>
        Condo
        <select name="condo_id" required defaultValue="">
          <option value="" disabled>
            Choose a condo
          </option>
          {((condos ?? []) as { id: string; name: string }[]).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Student (optional)
        <select name="student_id" defaultValue="">
          <option value="">None</option>
          {((students ?? []) as { id: string; full_name: string }[]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        When it happened
        <input type="datetime-local" name="occurred_at" />
      </label>
      <label>
        Type
        <select name="incident_type" defaultValue="injury">
          <option value="injury">Injury</option>
          <option value="near_drowning">Near-drowning</option>
          <option value="behaviour">Behaviour</option>
          <option value="pool_hazard">Pool hazard</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Severity
        <select name="severity" defaultValue="low">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label>
        What happened
        <textarea name="description" required />
      </label>
      <label>
        Who was informed
        <input name="informed_who" />
      </label>
      <label>
        How they were informed
        <select name="informed_channel" defaultValue="">
          <option value="">Not yet</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="none">Not informed</option>
        </select>
      </label>
      <label>
        When they were informed
        <input type="datetime-local" name="informed_at" />
      </label>
      <label>
        Follow-up
        <textarea name="follow_up" />
      </label>
      <button type="submit">Save incident</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function NewIncidentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Report an incident</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <NewIncident searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
