import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { closeIncident } from "./actions";
import { canManageCondos, homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type Row = {
  id: string;
  occurred_at: string;
  incident_type: string;
  severity: string;
  status: string;
  description: string;
};

async function IncidentList({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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

  const { data, error: loadError } = await supabase
    .from("incidents")
    .select("id, occurred_at, incident_type, severity, status, description")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (loadError) {
    return <p>Could not load incidents: {loadError.message}</p>;
  }

  const rows = (data ?? []) as Row[];
  return (
    <>
      <p>
        <Link href="/incidents/new">Report an incident</Link>
      </p>
      {error && <p role="alert">{error}</p>}
      {rows.length === 0 ? (
        <p>No incidents recorded.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {new Date(row.occurred_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} — {row.incident_type}{" "}
              — {row.severity} — {row.status} — {row.description}
              {canManageCondos(me.role) && row.status === "open" && (
                <form action={closeIncident} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit">Close</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function IncidentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main>
      <h1>Incidents</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <IncidentList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
