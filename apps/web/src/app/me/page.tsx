import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Avatar } from "../avatar";
import { PhotoMenu } from "./photo-menu";
import { ageFrom, type Student } from "@/lib/students";
import { homePathFor, isStaff } from "@/lib/permissions";
import { currentLang, t, type Lang } from "@/lib/i18n";
import { getCurrentProfile } from "@/lib/staff";
import { profilePhotoUrl } from "@/lib/uploads";
import { createServerSupabase } from "@/lib/supabase-server";
import { soonestClass } from "@/lib/class-time";
import { ClassCountdown } from "../next-class";
import { requestTime } from "@/lib/clock";

type OwnRecord = Pick<
  Student,
  "id" | "full_name" | "date_of_birth" | "status" | "start_level" | "current_level" | "start_date" | "photo_consent" | "data_consent"
>;

async function MyProfile() {
  await connection();
  const now = await requestTime();
  const lang: Lang = await currentLang();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data } = await supabase
    .from("students")
    .select("id, full_name, date_of_birth, status, start_level, current_level, start_date, photo_consent, data_consent")
    .eq("account_id", me.id)
    .maybeSingle();
  const record = data as OwnRecord | null;
  // Shown only while a request to link this account's children is waiting for the office to confirm it.
  const { count: pendingLinks } = await supabase
    .from("guardian_link_requests")
    .select("id", { count: "exact", head: true })
    .eq("requester_id", me.id)
    .eq("status", "pending");
  const waitingForLink = (pendingLinks ?? 0) > 0;
  const photoUrl = await profilePhotoUrl(supabase, me.avatar_path);
  // The family wording appears only for an account that is a guardian of a family.
  const { count: familyCount } = await supabase
    .from("family_guardians")
    .select("family_id", { count: "exact", head: true })
    .eq("profile_id", me.id);
  const isFamily = (familyCount ?? 0) > 0;
  const { data: condoData } = await supabase.rpc("my_condo_details");
  const condo = condoData as { name: string } | null;

  // Children are the students in the families this account is a guardian of.
  const { data: guardianOf } = await supabase.from("family_guardians").select("family_id").eq("profile_id", me.id);
  const familyIds = (guardianOf ?? []).map((row) => row.family_id);
  const { data: childData } = familyIds.length
    ? await supabase
        .from("students")
        .select("id, full_name, date_of_birth, status")
        .in("family_id", familyIds)
        .order("full_name")
    : { data: [] };
  const children = (childData ?? []) as Pick<Student, "id" | "full_name" | "date_of_birth" | "status">[];
  const { data: classData } = await supabase.rpc("my_classes");
  const myClasses = (classData ?? []) as {
    student_name: string;
    class_name: string;
    weekday: number;
    start_time: string;
    duration_minutes: number;
    coach_name: string | null;
    pool_name: string | null;
    condo_name: string | null;
    enrolled: number;
    capacity: number;
  }[];

  return (
    <>
      <section className="profile-head">
        <PhotoMenu lang={lang} userId={me.id} photoUrl={photoUrl}>
          <Avatar name={record?.full_name ?? me.full_name} photoUrl={photoUrl} large />
        </PhotoMenu>
        <div className="profile-text">
          <p className="profile-name">{record?.full_name ?? me.full_name}</p>
          {!photoUrl && <p className="pool-area">{t(lang, "photoHint")}</p>}
        </div>
      </section>

      <div className="tiles">
        {condo && (
          <Link className="tile" href="/my-condo">
            <span className="tile-title">{t(lang, "myCondo")}</span>
            <span className="tile-hint">{condo.name}</span>
          </Link>
        )}
        <Link className="tile" href="/portal">
          <span className="tile-title">{t(lang, isFamily ? "openPortal" : "openOwnPortal")}</span>
        </Link>
        <Link className="tile" href="/my-classes">
          <span className="tile-title">{t(lang, "myClasses")}</span>
          <span className="tile-hint">
            {soonestClass(myClasses, now) ? (
              <>
                {soonestClass(myClasses, now)?.class_name} · <ClassCountdown lang={lang} start={soonestClass(myClasses, now)?.start ?? now} now={now} />
              </>
            ) : (
              t(lang, "noMyClasses")
            )}
          </span>
        </Link>
        <Link className="tile" href="/card">
          <span className="tile-title">{t(lang, isFamily ? "childCard" : "myQrCard")}</span>
        </Link>
        <Link className="tile" href="/link-child">
          <span className="tile-title">{t(lang, isFamily ? "linkMyChild" : "createFamily")}</span>
        </Link>
      </div>

      {record ? (
        <>
          <div className="stats profile-stats">
            <div className="stat">
              <span className="stat-label">{t(lang, "age")}</span>
              <span className="stat-value">{ageFrom(record.date_of_birth)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t(lang, "startLevel")}</span>
              <span className="stat-value">{record.start_level ?? "-"}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t(lang, "currentLevel")}</span>
              <span className="stat-value">{record.current_level ?? "-"}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t(lang, "startDate")}</span>
              <span className="stat-value">{record.start_date ?? "-"}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t(lang, "photoConsent")}</span>
              <span className={record.photo_consent ? "stat-value consent-yes" : "stat-value consent-no"}>
                {record.photo_consent ? t(lang, "yes") : t(lang, "no")}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">{t(lang, "dataConsent")}</span>
              <span className={record.data_consent ? "stat-value consent-yes" : "stat-value consent-no"}>
                {record.data_consent ? t(lang, "yes") : t(lang, "no")}
              </span>
            </div>
          </div>
        </>
      ) : (
        waitingForLink && <p>{t(lang, "profilePreparing")}</p>
      )}

      {children.length > 0 && (
        <>
          <h2>{t(lang, "myChildren")}</h2>
          <div className="tiles">
            {children.map((child) => (
              <Link key={child.id} className="tile" href={`/students/${child.id}`}>
                <span className="tile-title">{child.full_name}</span>
                <span className="tile-hint">
                  {t(lang, "age")} {ageFrom(child.date_of_birth)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

async function MyProfileTitle() {
  const lang = await currentLang();
  return <h1>{t(lang, "myProfile")}</h1>;
}

export default function MyProfilePage() {
  return (
    <main>
      <Suspense fallback={<h1>My profile</h1>}>
        <MyProfileTitle />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <MyProfile />
      </Suspense>
    </main>
  );
}
