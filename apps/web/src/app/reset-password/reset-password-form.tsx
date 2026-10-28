"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await createBrowserSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage("The link has expired. Request a new reset email.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <form onSubmit={submit}>
      <label>
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
      </label>
      <button type="submit" disabled={busy}>
        Save password
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
