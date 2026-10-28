import Link from "next/link";
import { signIn } from "./actions";

export function LoginForm({ error }: { error?: string }) {
  return (
    <form action={signIn}>
      <label>
        Email
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input type="password" name="password" autoComplete="current-password" required />
      </label>

      <button type="submit">Log in</button>
      {error && <p role="alert">Email or password is wrong. The account may not be confirmed yet.</p>}

      <nav>
        <Link href="/signup">Sign up</Link> · <Link href="/forgot-password">Forgot password?</Link>
      </nav>
    </form>
  );
}
