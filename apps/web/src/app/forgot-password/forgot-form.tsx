"use client";

import Link from "next/link";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/messages";

export function ForgotForm({ lang }: { lang: Lang }) {
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
    setMessage(error ? error.message : t(lang, "resetSent"));
  }

  return (
    <form onSubmit={submit}>
      <label>
        {t(lang, "email")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <button type="submit" disabled={busy}>
        {t(lang, "sendReset")}
      </button>
      {message && <p role="alert">{message}</p>}

      <nav>
        <Link href="/login">{t(lang, "logIn")}</Link>
      </nav>
    </form>
  );
}
