import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ClassCountdown } from "../next-class";
import { currentLang, localeFor, t, type Key, type Lang } from "@/lib/i18n";
import { homePathFor, isStaff } from "@/lib/permissions";
import { requestTime } from "@/lib/clock";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

type Row = {
  session_id: string;
  class_name: string;
  starts_at: string;
  ends_at: string;
  session_status: string;
  cancel_reason: string | null;
  student_name: string;
  attendance: string | null;
  excused: boolean | null;
};

type Kind = "upcoming" | "attended" | "absent" | "other";

// Each session is one of: coming up, attended (present or late), absent, or other (cancelled, or past with no record).
function kindOf(row: Row, now: number): Kind {
  if (row.session_status === "cancelled") {
    return "other";
  }
  if (new Date(row.starts_at).getTime() > now && row.attendance === null) {
    return "upcoming";
  }
  if (row.attendance === "present" || row.attendance === "late") {
    return "attended";
  }
  if (row.attendance === "absent") {
    return "absent";
  }
  return "other";
}

const statusKey: Record<Kind, Key> = {
  upcoming: "statusUpcoming",
  attended: "statusAttended",
  absent: "statusAbsent",
  other: "statusOther",
};

function when(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Session({ lang, row, kind, now }: { lang: Lang; row: Row; kind: Kind; now: number }) {
  return (
    <li className={`session-card session-${kind}`}>
      <p className="session-title">{row.class_name}</p>
      <p className="pool-area">
        {when(lang, row.starts_at)} · {row.student_name}
      </p>
      <span className={`session-chip session-${kind}`}>
        {t(lang, statusKey[kind])}
        {row.excused ? ` · ${t(lang, "excused")}` : ""}
        {kind === "other" && row.session_status === "cancelled" && row.cancel_reason ? ` · ${row.cancel_reason}` : ""}
      </span>
      {kind === "upcoming" && (
        <p>
          <ClassCountdown lang={lang} start={new Date(row.starts_at).getTime()} now={now} />
        </p>
      )}
    </li>
  );
}

async function Schedule() {
  await connection();
  const lang = await currentLang();
  const now = await requestTime();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data } = await supabase.rpc("my_sessions");
  const rows = (data ?? []) as Row[];
  const groups: Record<Kind, Row[]> = { upcoming: [], attended: [], absent: [], other: [] };
  for (const row of rows) {
    groups[kindOf(row, now)].push(row);
  }
  const next = groups.upcoming[0] ?? null;

  if (rows.length === 0) {
    return <p>{t(lang, "noSessions")}</p>;
  }

  return (
    <>
      {next && (
        <section className="next-class">
          <p className="next-class-label">{t(lang, "nextClass")}</p>
          <p className="next-class-name">{next.class_name}</p>
          <p className="pool-area">{when(lang, next.starts_at)}</p>
          <ClassCountdown lang={lang} start={new Date(next.starts_at).getTime()} now={now} />
        </section>
      )}

      <div className="legend" aria-label={t(lang, "legend")}>
        <span className="session-chip session-upcoming">{t(lang, "statusUpcoming")}</span>
        <span className="session-chip session-attended">{t(lang, "statusAttended")}</span>
        <span className="session-chip session-absent">{t(lang, "statusAbsent")}</span>
        <span className="session-chip session-other">{t(lang, "statusOther")}</span>
      </div>

      <h2>{t(lang, "sectionUpcoming")}</h2>
      {groups.upcoming.length === 0 ? (
        <p>{t(lang, "noUpcoming")}</p>
      ) : (
        <ul className="session-list">
          {groups.upcoming.map((row) => (
            <Session key={`${row.session_id}-${row.student_name}`} lang={lang} row={row} kind="upcoming" now={now} />
          ))}
        </ul>
      )}

      <h2>{t(lang, "sectionAttended")}</h2>
      {groups.attended.length === 0 ? (
        <p>{t(lang, "noAttended")}</p>
      ) : (
        <ul className="session-list">
          {[...groups.attended].reverse().map((row) => (
            <Session key={`${row.session_id}-${row.student_name}`} lang={lang} row={row} kind="attended" now={now} />
          ))}
        </ul>
      )}

      <h2>{t(lang, "sectionAbsent")}</h2>
      {groups.absent.length === 0 ? (
        <p>{t(lang, "noAbsent")}</p>
      ) : (
        <ul className="session-list">
          {[...groups.absent].reverse().map((row) => (
            <Session key={`${row.session_id}-${row.student_name}`} lang={lang} row={row} kind="absent" now={now} />
          ))}
        </ul>
      )}

      {groups.other.length > 0 && (
        <>
          <h2>{t(lang, "sectionOther")}</h2>
          <ul className="session-list">
            {[...groups.other].reverse().map((row) => (
              <Session key={`${row.session_id}-${row.student_name}`} lang={lang} row={row} kind="other" now={now} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

async function ScheduleTitle() {
  const lang = await currentLang();
  return <h1>{t(lang, "myClasses")}</h1>;
}

export default function MyClassesPage() {
  return (
    <main>
      <Suspense fallback={<h1>My classes</h1>}>
        <ScheduleTitle />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <Schedule />
      </Suspense>
    </main>
  );
}
