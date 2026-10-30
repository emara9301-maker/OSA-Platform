import { Suspense } from "react";
import { SignupForm } from "./signup-form";
import { currentLang, t } from "@/lib/i18n";

async function SignupPageContent() {
  const lang = await currentLang();
  return (
    <>
      <h1>{t(lang, "createAccount")}</h1>
      <SignupForm lang={lang} />
    </>
  );
}

export default function SignupPage() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <SignupPageContent />
      </Suspense>
    </main>
  );
}
