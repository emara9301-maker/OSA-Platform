"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/messages";

export function ResetPasswordForm({ lang }: { lang: Lang }) {
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
      setMessage(t(lang, "resetExpired"));
      return;
    }
    router.push("/dashboard");
  }

  return (
    <form onSubmit={submit}>
      <label>
        {t(lang, "newPassword")}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
      </label>
      <button type="submit" disabled={busy}>
        {t(lang, "savePassword")}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
