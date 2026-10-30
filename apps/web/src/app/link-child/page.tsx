import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createFamily, requestLink } from "./actions";
import { QrScanner } from "./qr-scanner";
import { currentLang, t, type Lang } from "@/lib/i18n";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type RequestRow = { id: string; relationship: string; status: string; created_at: string };

async function LinkChild({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; saved?: string }> }) {
  await connection();
  const lang: Lang = await currentLang();
  const { error, sent, saved } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("guardian_link_requests")
    .select("id, relationship, status, created_at")
    .order("created_at", { ascending: false });
  const requests = (data ?? []) as RequestRow[];
  const { count: familyCount } = await supabase
    .from("family_guardians")
    .select("family_id", { count: "exact", head: true })
    .eq("profile_id", me.id);
  const isFamily = (familyCount ?? 0) > 0;

  return (
    <>
      {sent && <p role="status">{t(lang, "linkRequestSent")}</p>}
      {saved === "family" && <p role="status">{t(lang, "familyCreated")}</p>}
      {error && <p role="alert">{error}</p>}

      {!isFamily && (
        <form action={createFamily}>
          <h2>{t(lang, "createFamily")}</h2>
          <p className="pool-area">{t(lang, "createFamilyHint")}</p>
          <label>
            {t(lang, "familyName")}
            <input name="name" defaultValue={me.full_name} required />
          </label>
          <button type="submit">{t(lang, "createFamily")}</button>
        </form>
      )}

      <form action={requestLink}>
        <label>
          {t(lang, "childCode")}
          <input name="token" required />
        </label>
        <QrScanner targetName="token" lang={lang} />
        <label>
          {t(lang, "relationship")}
          <input name="relationship" placeholder={t(lang, "relationshipHint")} required />
        </label>
        <button type="submit">{t(lang, "sendRequest")}</button>
      </form>

      <h2>{t(lang, "yourRequests")}</h2>
      {requests.length === 0 ? (
        <p>{t(lang, "noRequests")}</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li key={request.id}>
              {request.relationship} — {request.status} — {new Date(request.created_at).toISOString()}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function LinkChildTitle() {
  const lang = await currentLang();
  return <h1>{t(lang, "linkMyChild")}</h1>;
}

export default function LinkChildPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; saved?: string }> }) {
  return (
    <main>
      <Suspense fallback={<h1>Link my child</h1>}>
        <LinkChildTitle />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <LinkChild searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
