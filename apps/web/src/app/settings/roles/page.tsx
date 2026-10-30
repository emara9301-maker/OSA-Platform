import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, type AccountRole, type Profile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { RoleSelect } from "./role-select";

async function RoleList() {
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
    .from("profiles")
    .select("id, username, role")
    .order("username");

  if (error) {
    return <p>Could not load accounts: {error.message}</p>;
  }
  const { data: assignableData } = await supabase.rpc("assignable_roles");
  const assignable = (assignableData ?? []) as AccountRole[];

  const accounts = (data ?? []) as { id: string; username: string | null; role: Profile["role"] }[];
  if (accounts.length === 0) {
    return <p>No accounts are visible to you.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.id}>
            <td>{account.username ?? "no username"}</td>
            <td>
              <RoleSelect accountId={account.id} role={account.role} assignable={assignable} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RolesPage() {
  return (
    <main>
      <h1>Roles</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <RoleList />
      </Suspense>
    </main>
  );
}
