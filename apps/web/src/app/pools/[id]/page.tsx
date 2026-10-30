import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { currentLang, localeFor, t, type Key, type Lang } from "@/lib/i18n";
import { poolPhoto } from "@/lib/pool-photo";
import { createServerSupabase } from "@/lib/supabase-server";
import { getCurrentProfile } from "@/lib/staff";
import { isStaff } from "@/lib/permissions";
import { joinClass } from "../actions";
import { nextClassStart } from "@/lib/class-time";
import { requestTime } from "@/lib/clock";
import { ClassCountdown } from "../../next-class";

// The ids and names of this account's students who already joined a class.
function joinedIds(mine: { class_id: string; student_id: string }[], classId: string): string[] {
  return mine.filter((row) => row.class_id === classId).map((row) => row.student_id);
}

function joinedNames(mine: { class_id: string; student_name: string }[], classId: string): string[] {
  return mine.filter((row) => row.class_id === classId).map((row) => row.student_name);
}

type PoolClass = {
  class_id: string;
  name: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  enrolled: number;
  coach_name: string | null;
};

const weekdayName: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const typeKeys: Record<string, Key> = {
  private_1_1: "typePrivate",
  semi_private_1_2: "typeSemi",
  small_group: "typeSmall",
  adult: "typeAdult",
};

type Detail = { label: string; value: string };
type PoolDetails = {
  id: string;
  name: string;
  condo_id: string;
  condo_name: string;
  image_url: string | null;
  pool_hours: string | null;
  fields: Detail[];
  extras: Detail[];
};
type Pkg = { id: string; name: string; type: string; sessions_count: number; session_minutes: number; validity_days: number; price: number | null };

const coordinates = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

async function PoolContent({ id, lang, error, joined }: { id: string; lang: Lang; error?: string; joined?: string }) {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  // Children of this account, for choosing who joins a class. An account with no children joins for itself.
  const { data: guardianOf } = me ? await supabase.from("family_guardians").select("family_id").eq("profile_id", me.id) : { data: [] };
  const familyIds = (guardianOf ?? []).map((row) => row.family_id);
  const { data: childData } = familyIds.length
    ? await supabase.from("students").select("id, full_name").in("family_id", familyIds).order("full_name")
    : { data: [] };
  const children = (childData ?? []) as { id: string; full_name: string }[];
  const canJoin = me !== null && !isStaff(me.role);
  // The classes this account and its children already joined, so the page shows them as joined.
  const { data: mineData } = canJoin ? await supabase.rpc("my_classes") : { data: [] };
  const mine = (mineData ?? []) as { class_id: string; student_id: string; student_name: string }[];
  const now = await requestTime();
  const { data } = await supabase.rpc("public_pool_details", { p_pool_id: id });
  if (!data) {
    notFound();
  }
  const pool = data as PoolDetails;

  // A pool's packages are its own, with its own prices.
  const { data: pkgData } = await supabase
    .from("packages")
    .select("id, name, type, sessions_count, session_minutes, validity_days, price")
    .eq("pool_id", id)
    .order("price", { ascending: true });
  const packages = (pkgData ?? []) as Pkg[];

  // The times the pool's classes run, for visitors. Only the class, its time, and the coach's name.
  const { data: classData } = await supabase.rpc("public_pool_classes", { p_pool_id: id });
  const classes = (classData ?? []) as PoolClass[];

  return (
    <>
      <p>
        <Link href={`/sites/${pool.condo_id}`}>{pool.condo_name}</Link>
      </p>
      <div className="pool-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poolPhoto(pool.name, pool.image_url)} alt={pool.name} />
      </div>
      <h1>{pool.name}</h1>
      {pool.pool_hours && (
        <p className="pool-open">
          {t(lang, "openHours")}: <strong>{pool.pool_hours}</strong>
        </p>
      )}
      <dl>
        {pool.fields.map((field) => (
          <div key={field.label} style={{ display: "contents" }}>
            <dt>{field.label}</dt>
            <dd>
              {coordinates.test(field.value) ? (
                <a href={`https://www.google.com/maps?q=${field.value}`} target="_blank" rel="noreferrer">
                  {field.value}
                </a>
              ) : (
                field.value
              )}
            </dd>
          </div>
        ))}
        {pool.extras.map((extra) => (
          <div key={extra.label} style={{ display: "contents" }}>
            <dt>{extra.label}</dt>
            <dd>{extra.value}</dd>
          </div>
        ))}
      </dl>

      <h2>{t(lang, "classTimes")}</h2>
      {joined && <p role="status">{t(lang, "joinedOk")}</p>}
      {error && <p role="alert">{error}</p>}
      {classes.length === 0 ? (
        <p>{t(lang, "noClassTimes")}</p>
      ) : (
        <ul className="records">
          {classes.map((item) => (
            <li key={item.class_id}>
              <strong>{item.name}</strong>
              <br />
              {weekdayName[item.weekday]} · {item.start_time.slice(0, 5)} · {t(lang, "minutesEach", { minutes: item.duration_minutes })}
              {item.coach_name && (
                <>
                  <br />
                  {t(lang, "coachLabel")}: {item.coach_name}
                </>
              )}
              <br />
              {t(lang, "joinedCount", { enrolled: item.enrolled, capacity: item.capacity })}
              <br />
              <ClassCountdown lang={lang} start={nextClassStart(item.weekday, item.start_time, now)} now={now} />
              {item.enrolled >= item.capacity ? (
                <>
                  <br />
                  <strong>{t(lang, "classFull")}</strong>
                </>
              ) : !me ? (
                <>
                  <br />
                  <Link className="button" href={`/login?next=${encodeURIComponent(`/pools/${id}`)}`}>
                    {t(lang, "joinLogin")}
                  </Link>
                </>
              ) : (
                canJoin && (
                  <>
                    {joinedNames(mine, item.class_id).length > 0 && (
                      <>
                        <br />
                        <strong>{t(lang, "joinedBy")}: {joinedNames(mine, item.class_id).join(", ")}</strong>
                      </>
                    )}
                    {(children.length > 0
                      ? children.some((child) => !joinedIds(mine, item.class_id).includes(child.id))
                      : joinedNames(mine, item.class_id).length === 0) && (
                      <form action={joinClass}>
                        <input type="hidden" name="pool_id" value={id} />
                        <input type="hidden" name="class_id" value={item.class_id} />
                        {children.length > 0 && (
                          <label>
                            {t(lang, "joinWho")}
                            <select name="student_id" defaultValue="" required>
                              <option value="" disabled>
                                {t(lang, "buyPick")}
                              </option>
                              {children
                                .filter((child) => !joinedIds(mine, item.class_id).includes(child.id))
                                .map((child) => (
                                  <option key={child.id} value={child.id}>
                                    {child.full_name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <button type="submit">{t(lang, "join")}</button>
                      </form>
                    )}
                  </>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>{t(lang, "packages")}</h2>
      {packages.length === 0 ? (
        <p>{t(lang, "noPackages")}</p>
      ) : (
        <ul className="records">
          {packages.map((pkg) => (
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
    </>
  );
}

export default function PoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; joined?: string }>;
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <PoolPageContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PoolPageContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; joined?: string }>;
}) {
  await connection();
  const lang = await currentLang();
  const { id } = await params;
  const { error, joined } = await searchParams;
  return <PoolContent id={id} lang={lang} error={error} joined={joined} />;
}
