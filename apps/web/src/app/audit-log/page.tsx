import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canReadAuditLog } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type AuditRow = {
  id: number;
  action: string;
  table_name: string;
  record_id: string;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
  actor: { email: string }[] | null;
};

async function AuditRows() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }
  if (!canReadAuditLog(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, table_name, record_id, before_data, after_data, created_at, actor:profiles(email)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return <p>Could not load the audit log: {error.message}</p>;
  }

  const rows = (data ?? []) as AuditRow[];
  if (rows.length === 0) {
    return <p>No changes recorded yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Who</th>
          <th>Action</th>
          <th>Table</th>
          <th>Record</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.created_at).toISOString()}</td>
            <td>{row.actor?.[0]?.email ?? "system"}</td>
            <td>{row.action}</td>
            <td>{row.table_name}</td>
            <td>{row.record_id}</td>
            <td>
              <code>{row.before_data ? JSON.stringify(row.before_data) : "-"}</code>
            </td>
            <td>
              <code>{row.after_data ? JSON.stringify(row.after_data) : "-"}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditLogPage() {
  return (
    <main>
      <h1>Audit log</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <AuditRows />
      </Suspense>
    </main>
  );
}
