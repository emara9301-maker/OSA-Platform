import { Suspense } from "react";
import { ForgotForm } from "./forgot-form";
import { currentLang, t } from "@/lib/i18n";

async function ForgotPageContent() {
  const lang = await currentLang();
  return (
    <>
      <h1>{t(lang, "forgotTitle")}</h1>
      <ForgotForm lang={lang} />
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <ForgotPageContent />
      </Suspense>
    </main>
  );
}
