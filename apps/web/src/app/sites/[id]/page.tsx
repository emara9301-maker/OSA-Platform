import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { currentLang, t, type Lang } from "@/lib/i18n";
import { poolPhoto } from "@/lib/pool-photo";
import { createServerSupabase } from "@/lib/supabase-server";

type Pool = { id: string; name: string; pool_hours: string | null; image_url: string | null };
type Condo = { id: string; name: string; area: string | null; address: string | null; image_url: string | null; pools: Pool[] };

async function CondoContent({ id, lang }: { id: string; lang: Lang }) {
  await connection();
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("public_condo_details", { p_condo_id: id });
  if (!data) {
    notFound();
  }
  const condo = data as Condo;

  return (
    <>
      <div className="pool-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poolPhoto(condo.name, condo.image_url)} alt={condo.name} />
      </div>
      <h1>{condo.name}</h1>
      {(condo.area || condo.address) && (
        <p className="pool-area">{[condo.area, condo.address].filter(Boolean).join(" — ")}</p>
      )}

      <h2>{t(lang, "pools")}</h2>
      {condo.pools.length === 0 ? (
        <p>{t(lang, "noPoolsHere")}</p>
      ) : (
        <div className="pool-grid">
          {condo.pools.map((pool) => (
            <Link key={pool.id} href={`/pools/${pool.id}`} className="pool-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={poolPhoto(pool.name, pool.image_url)} alt={pool.name} />
              <div className="pool-card-body">
                <h3>{pool.name}</h3>
                {pool.pool_hours && (
                  <p className="pool-hours">
                    {t(lang, "openHours")}: {pool.pool_hours}
                  </p>
                )}
                <span className="pool-link">{t(lang, "viewPool")} →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function CondoPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <CondoPageContent params={params} />
      </Suspense>
    </main>
  );
}

async function CondoPageContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const lang = await currentLang();
  const { id } = await params;
  return <CondoContent id={id} lang={lang} />;
}
