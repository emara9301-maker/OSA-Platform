import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type Row = {
  id: string;
  starts_at: string;
  status: string;
  classes: { id: string; name: string } | null;
};

async function Upcoming() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, starts_at, status, classes(id, name)")
    .gte("starts_at", new Date().toISOString())
    .lte("starts_at", until)
    .order("starts_at");
  if (error) {
    return <p>Could not load the schedule: {error.message}</p>;
  }

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    return <p>No lessons in the next 14 days.</p>;
  }

  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          {new Date(row.starts_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} —{" "}
          {row.classes?.id ? <Link href={`/classes/${row.classes.id}`}>{row.classes.name}</Link> : "class"} — {row.status}
        </li>
      ))}
    </ul>
  );
}

export default function SchedulePage() {
  return (
    <main>
      <h1>Schedule</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Upcoming />
      </Suspense>
    </main>
  );
}
