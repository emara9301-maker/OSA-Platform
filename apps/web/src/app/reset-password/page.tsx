import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";
import { currentLang, t } from "@/lib/i18n";

async function ResetPageContent() {
  const lang = await currentLang();
  return (
    <>
      <h1>{t(lang, "resetTitle")}</h1>
      <ResetPasswordForm lang={lang} />
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <ResetPageContent />
      </Suspense>
    </main>
  );
}
