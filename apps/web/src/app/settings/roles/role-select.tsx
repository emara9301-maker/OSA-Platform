"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountRoles, type AccountRole } from "@/lib/staff";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export function RoleSelect({ accountId, role }: { accountId: string; role: AccountRole }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function change(newRole: AccountRole) {
    setError(null);
    const { error } = await createBrowserSupabase().rpc("set_account_role", {
      target_id: accountId,
      new_role: newRole,
    });

    if (error) {
      setError("You are not allowed to set this role.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <select value={role} onChange={(e) => change(e.target.value as AccountRole)}>
        {accountRoles.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}
