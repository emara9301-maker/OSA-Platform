"use client";

import Link from "next/link";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/messages";

const usernamePattern = /^[A-Za-z0-9_]{3,20}$/;

export function SignupForm({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    if (!usernamePattern.test(username)) {
      setBusy(false);
      setMessage(t(lang, "usernameRule"));
      return;
    }

    const birth = new Date(`${dateOfBirth}T00:00:00`);
    if (Number.isNaN(birth.getTime()) || birth > new Date()) {
      setBusy(false);
      setMessage(t(lang, "invalidBirth"));
      return;
    }

    const supabase = createBrowserSupabase();
    const { data: available, error: availabilityError } = await supabase.rpc("is_username_available", {
      name: username,
    });
    if (availabilityError || available === false) {
      setBusy(false);
      setMessage(availabilityError ? availabilityError.message : t(lang, "takenUsername"));
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, phone, full_name: fullName, date_of_birth: dateOfBirth },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <p role="status">{t(lang, "signedUpCheck")}</p>
        <p>
          <Link href="/login">{t(lang, "logInLink")}</Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <label>
        {t(lang, "fullName")}
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
      </label>
      <label>
        {t(lang, "dateOfBirth")}
        <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
      </label>
      <label>
        {t(lang, "email")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        {t(lang, "username")}
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        {t(lang, "phone")}
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label>
        {t(lang, "password")}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </label>

      <button type="submit" disabled={busy}>
        {t(lang, "signUp")}
      </button>
      {message && <p role="alert">{message}</p>}

      <nav>
        <Link href="/login">{t(lang, "logIn")}</Link>
      </nav>
    </form>
  );
}
