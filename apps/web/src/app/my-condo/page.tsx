import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentLang, localeFor, t, type Key, type Lang } from "@/lib/i18n";
import { homePathFor, isStaff } from "@/lib/permissions";
import { poolPhoto } from "@/lib/pool-photo";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { loadCondoChat } from "@/lib/condo-chat";
import { weekdays } from "@/lib/classes";
import { CondoChat } from "../condo-chat";
import { nextClassStart } from "@/lib/class-time";
import { requestTime } from "@/lib/clock";
import { ClassCountdown } from "../next-class";

type MyPool = { id: string; name: string; pool_hours: string | null; rules: string | null; access_notes: string | null; image_url: string | null };
type Pkg = {
  id: string;
  name: string;
  type: string;
  sessions_count: number;
  session_minutes: number;
  validity_days: number;
  price: number | null;
  pool_id: string;
};

const typeKeys: Record<string, Key> = {
  private_1_1: "typePrivate",
  semi_private_1_2: "typeSemi",
  small_group: "typeSmall",
  adult: "typeAdult",
};
type MyCondo = { id: string; name: string; area: string | null; address: string | null; contact_phone: string | null; pools: MyPool[] };

async function CondoContent({ lang }: { lang: Lang }) {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data } = await supabase.rpc("my_condo_details");
  if (!data) {
    return <p>{t(lang, "noCondoYet")}</p>;
  }
  const condo = data as MyCondo;
  const messages = await loadCondoChat(supabase, condo.id, lang);
  // The next class of this account (or its children) at this condo.
  const now = await requestTime();
  const { data: classData } = await supabase.rpc("my_classes");
  const myClasses = (
    (classData ?? []) as {
      class_name: string;
      weekday: number;
      start_time: string;
      duration_minutes: number;
      coach_name: string | null;
      condo_name: string | null;
      pool_name: string | null;
    }[]
  ).filter((item) => item.condo_name === condo.name);
  const poolIds = condo.pools.map((pool) => pool.id);
  const { data: packageData } = poolIds.length
    ? await supabase
        .from("packages")
        .select("id, name, type, sessions_count, session_minutes, validity_days, price, pool_id")
        .in("pool_id", poolIds)
        .eq("is_active", true)
        .order("price", { ascending: true })
    : { data: [] };
  const packages = (packageData ?? []) as Pkg[];

  return (
    <div className="with-chat">
      <div className="with-chat-main">
      <h1>{condo.name}</h1>
      {(condo.area || condo.address) && <p className="pool-area">{[condo.area, condo.address].filter(Boolean).join(" — ")}</p>}
      {condo.contact_phone && (
        <p>
          {t(lang, "contactPhone")}: <a href={`tel:${condo.contact_phone}`}>{condo.contact_phone}</a>
        </p>
      )}

      {condo.pools.map((pool) => (
        <section key={pool.id} className="child-card">
          <h2>{pool.name}</h2>
          <div className="pool-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poolPhoto(pool.name, pool.image_url)} alt={pool.name} />
          </div>
          <dl>
            {pool.pool_hours && (
              <>
                <dt>{t(lang, "openHours")}</dt>
                <dd>{pool.pool_hours}</dd>
              </>
            )}
            {pool.rules && (
              <>
                <dt>{t(lang, "poolRules")}</dt>
                <dd className="pre-line">{pool.rules}</dd>
              </>
            )}
            {pool.access_notes && (
              <>
                <dt>{t(lang, "howToGetIn")}</dt>
                <dd className="pre-line">{pool.access_notes}</dd>
              </>
            )}
          </dl>

          <h3>{t(lang, "packages")}</h3>
          {packages.filter((pkg) => pkg.pool_id === pool.id).length === 0 ? (
            <p>{t(lang, "noPackages")}</p>
          ) : (
            <ul className="records">
              {packages
                .filter((pkg) => pkg.pool_id === pool.id)
                .map((pkg) => (
                  <li key={pkg.id}>
                    <strong>{pkg.name}</strong>
                    <br />
                    {t(lang, typeKeys[pkg.type] ?? "typeSmall")} · {t(lang, "lessons", { count: pkg.sessions_count })} ·{" "}
                    {t(lang, "minutesEach", { minutes: pkg.session_minutes })} · {t(lang, "validFor", { days: pkg.validity_days })}
                    <br />
                    {pkg.price === null
                      ? t(lang, "priceToConfirm")
                      : `RM ${Number(pkg.price).toLocaleString(localeFor(lang), { minimumFractionDigits: 2 })}`}
                    <br />
                    <Link className="button" href={`/buy/${pkg.id}`}>
                      {t(lang, "choose")}
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}
      </div>

      {myClasses.length > 0 && (
        <>
          <h2>{t(lang, "myClasses")}</h2>
          <ul className="records">
            {myClasses.map((item, index) => (
              <li key={`${item.class_name}-${item.weekday}-${item.start_time}-${index}`}>
                <strong>{item.class_name}</strong>
                <br />
                {weekdays.find((day) => day.value === item.weekday)?.label} · {item.start_time.slice(0, 5)} · {t(lang, "minutesEach", { minutes: item.duration_minutes })}
                {item.pool_name && (
                  <>
                    <br />
                    {item.pool_name}
                  </>
                )}
                {item.coach_name && (
                  <>
                    <br />
                    {t(lang, "coachLabel")}: {item.coach_name}
                  </>
                )}
                <br />
                <ClassCountdown lang={lang} start={nextClassStart(item.weekday, item.start_time, now)} now={now} />
              </li>
            ))}
          </ul>
        </>
      )}

      <CondoChat lang={lang} condoId={condo.id} meId={me.id} messages={messages} canPost canDelete={false} />
    </div>
  );
}

export default function MyCondoPage() {
  return (
    <Suspense fallback={<main><p>Loading...</p></main>}>
      <MyCondoPageContent />
    </Suspense>
  );
}

async function MyCondoPageContent() {
  await connection();
  const lang = await currentLang();
  return (
    <main className="wide">
      <Suspense fallback={<p>Loading...</p>}>
        <CondoContent lang={lang} />
      </Suspense>
    </main>
  );
}
