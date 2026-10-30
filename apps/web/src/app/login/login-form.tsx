import Link from "next/link";
import { signIn } from "./actions";
import { t, type Lang } from "@/lib/i18n";

export function LoginForm({ error, next, lang }: { error?: string; next?: string; lang: Lang }) {
  return (
    <form action={signIn}>
      <input type="hidden" name="next" value={next ?? ""} />
      <label>
        {t(lang, "email")}
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label>
        {t(lang, "password")}
        <input type="password" name="password" autoComplete="current-password" required />
      </label>

      <button type="submit">{t(lang, "logIn")}</button>
      {error && <p role="alert">{t(lang, "loginWrong")}</p>}

      <nav>
        <Link href="/signup">{t(lang, "signUp")}</Link> · <Link href="/forgot-password">{t(lang, "forgotPassword")}</Link>
      </nav>
    </form>
  );
}
