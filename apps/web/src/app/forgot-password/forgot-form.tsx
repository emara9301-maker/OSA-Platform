"use client";

import Link from "next/link";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await createBrowserSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setBusy(false);
    setMessage(
      error ? error.message : "If this email has an account, a reset link has been sent.",
    );
  }

  return (
    <form onSubmit={submit}>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <button type="submit" disabled={busy}>
        Send reset link
      </button>
      {message && <p role="alert">{message}</p>}

      <nav>
        <Link href="/login">Log in</Link>
      </nav>
    </form>
  );
}
