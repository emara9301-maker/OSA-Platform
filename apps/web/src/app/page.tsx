import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { checkDatabase } from "@/lib/health";
import { currentLang, t, type Lang } from "@/lib/i18n";
import { createServerSupabase } from "@/lib/supabase-server";
import { getCurrentProfile } from "@/lib/staff";
import { poolPhoto } from "@/lib/pool-photo";
import { NearbyCondos, type ListedCondo } from "./nearby-condos";

async function Pools({ lang }: { lang: Lang }) {
  await connection();
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("public_condos");
  const condos = (data ?? []) as ListedCondo[];
  if (condos.length === 0) {
    return <p>{t(lang, "noPools")}</p>;
  }
  return (
    <>
      <NearbyCondos lang={lang} condos={condos} />
      <div className="pool-grid">
        {condos.map((condo) => (
          <Link key={condo.id} href={`/sites/${condo.id}`} className="pool-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poolPhoto(condo.name, condo.image_url)} alt={condo.name} />
            <div className="pool-card-body">
              <h3>{condo.name}</h3>
              {condo.area && <p className="pool-area">{condo.area}</p>}
              <p className="pool-hours">{t(lang, "poolsCount", { count: condo.pool_count })}</p>
              <span className="pool-link">{t(lang, "viewPool")} →</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

async function DatabaseStatus() {
  await connection();

  let message: string;
  try {
    const time = await checkDatabase();
    message = `Connected to database at ${time.toISOString()}`;
  } catch (error) {
    message = `Database error: ${error instanceof Error ? error.message : "unknown"}`;
  }
  return <p>{message}</p>;
}

async function HomeBody() {
  await connection();
  const lang = await currentLang();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  const signedIn = me !== null && me.is_active;
  return (
    <>
      <section className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero-pool.jpg" alt="" className="hero-photo" />
        <div className="hero-body">
          <h1>{t(lang, "heroTitle")}</h1>
          <p>{t(lang, "heroText")}</p>
          <p>
            <Link className="button" href="#condos">
              {t(lang, "chooseYourPool")}
            </Link>
            {!signedIn && (
              <Link className="button button-secondary" href="/signup">
                {t(lang, "signUp")}
              </Link>
            )}
          </p>
          {signedIn && <p className="hero-hint">{t(lang, "signedInHint")}</p>}
        </div>
      </section>

      <section>
        <h2>{t(lang, "howTitle")}</h2>
        <div className="steps">
          <div className="step">
            <span className="step-number">1</span>
            <h3>{t(lang, "step1Title")}</h3>
            <p>{t(lang, "step1Text")}</p>
          </div>
          <div className="step">
            <span className="step-number">2</span>
            <h3>{t(lang, "step2Title")}</h3>
            <p>{t(lang, "step2Text")}</p>
          </div>
          <div className="step">
            <span className="step-number">3</span>
            <h3>{t(lang, "step3Title")}</h3>
            <p>{t(lang, "step3Text")}</p>
          </div>
        </div>
      </section>

      <section className="rain-note">
        <h2>{t(lang, "rainTitle")}</h2>
        <p>{t(lang, "rainText")}</p>
      </section>

      <section className="portal-pitch">
        <div>
          <h2>{t(lang, "portalPitchTitle")}</h2>
          <p>{t(lang, "portalPitchText")}</p>
        </div>
        <div className="phone-card" aria-hidden="true">
          <p className="phone-label">{t(lang, "portalNext")}</p>
          <p className="phone-value">Tuesday, 5:00 pm</p>
          <p className="phone-label">{t(lang, "portalLeft")}</p>
          <p className="phone-value">6</p>
          <p className="phone-note">{t(lang, "portalNote")}</p>
        </div>
      </section>

      <section id="condos">
        <h2>{t(lang, "condos")}</h2>
        <Suspense fallback={<p>...</p>}>
          <Pools lang={lang} />
        </Suspense>
      </section>

      <footer style={{ marginTop: "40px", color: "var(--color-muted)", fontSize: "0.85rem" }}>
        <Suspense fallback={<p>Checking database...</p>}>
          <DatabaseStatus />
        </Suspense>
      </footer>
    </>
  );
}

export default function Home() {
  return (
    <main>
      <Suspense fallback={<p>...</p>}>
        <HomeBody />
      </Suspense>
    </main>
  );
}
