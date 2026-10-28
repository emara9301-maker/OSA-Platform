"use client";

import Link from "next/link";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const usernamePattern = /^[A-Za-z0-9_]{3,20}$/;

export function SignupForm() {
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
      setMessage("Username must be 3 to 20 letters, digits or underscores.");
      return;
    }

    const birth = new Date(`${dateOfBirth}T00:00:00`);
    if (Number.isNaN(birth.getTime()) || birth > new Date()) {
      setBusy(false);
      setMessage("Enter a valid date of birth.");
      return;
    }

    const supabase = createBrowserSupabase();
    const { data: available, error: availabilityError } = await supabase.rpc("is_username_available", {
      name: username,
    });
    if (availabilityError || available === false) {
      setBusy(false);
      setMessage(availabilityError ? availabilityError.message : "This username is already taken.");
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
      <p role="status">
        Account created. Check your email and click the confirmation link, then <Link href="/login">log in</Link>.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <label>
        Full name
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
      </label>
      <label>
        Date of birth
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          required
        />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label>
        Phone number
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label>
        Password
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
        Sign up
      </button>
      {message && <p role="alert">{message}</p>}

      <nav>
        <Link href="/login">Log in</Link>
      </nav>
    </form>
  );
}
