import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canManageCondos, homePathFor, isStaff } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { weekdays } from "@/lib/classes";

type Row = { id: string; name: string; weekday: number; start_time: string; capacity: number };

async function ClassList() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase
    .from("classes")
    .select("id, name, weekday, start_time, capacity")
    .order("name");
  if (error) {
    return <p>Could not load classes: {error.message}</p>;
  }

  const classes = (data ?? []) as Row[];
  return (
    <>
      {canManageCondos(me.role) && (
        <p>
          <Link href="/classes/new">Add class</Link>
        </p>
      )}
      {classes.length === 0 ? (
        <p>No classes yet.</p>
      ) : (
        <ul>
          {classes.map((item) => (
            <li key={item.id}>
              <Link href={`/classes/${item.id}`}>{item.name}</Link> — {weekdays[item.weekday - 1].label}{" "}
              {item.start_time.slice(0, 5)} — capacity {item.capacity}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ClassesPage() {
  return (
    <main>
      <h1>Classes</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <ClassList />
      </Suspense>
    </main>
  );
}
