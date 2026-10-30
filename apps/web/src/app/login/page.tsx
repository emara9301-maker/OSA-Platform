import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { currentLang, t } from "@/lib/i18n";

async function LoginFormWithError({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const lang = await currentLang();
  const { error, next } = await searchParams;
  return (
    <>
      <h1>{t(lang, "loginTitle")}</h1>
      <LoginForm error={error} next={next} lang={lang} />
    </>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <LoginFormWithError searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
