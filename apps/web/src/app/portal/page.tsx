import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { bookMakeUp, cancelFamilyPause, payInvoice, pausePackage } from "./actions";
import { homePathFor, isStaff } from "@/lib/permissions";
import { parsePoolHours, suggestMakeUpSlots, type Busy } from "@/lib/make-ups";
import { currentLang, localeFor, t, type Key, type Lang } from "@/lib/i18n";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

const savedMessages: Record<string, Key> = {
  payment: "paidThanks",
  booked: "bookedThanks",
  invoice: "invoiceReady",
  paused: "pauseSaved",
  unpaused: "pauseCancelled",
};

const paymentKeys: Record<string, Key> = {
  paid: "paid",
  due_soon: "dueSoon",
  overdue: "overdue",
  on_hold: "onHold",
};

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

type Token = {
  id: string;
  class_id: string;
  source_session_id: string;
  expires_at: string;
  classes: { name: string } | null;
};

type Context = {
  pool_hours: string | null;
  duration_minutes: number;
  min_notice_hours: number;
  search_days: number;
  suggestion_count: number;
  slot_step_minutes: number;
  busy: { start: string; end: string }[];
} | null;

const kl = (value: string | Date, lang: Lang) =>
  new Date(value).toLocaleString(localeFor(lang), { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });

// Three free times from the coach's diary, inside the pool's hours, for one lesson's tokens.
async function MakeUpChoices({ supabase, group, lang }: { supabase: Supabase; group: Token[]; lang: Lang }) {
  const first = group[0];
  const { data: contextData } = await supabase.rpc("make_up_schedule_context", { p_class_id: first.class_id });
  const context = contextData as Context;
  const pool = parsePoolHours(context?.pool_hours ?? null);
  const slots =
    context && pool
      ? suggestMakeUpSlots({
          now: new Date(),
          minNoticeHours: context.min_notice_hours,
          durationMinutes: context.duration_minutes,
          pool,
          busy: context.busy.map((b): Busy => ({ start: new Date(b.start), end: new Date(b.end) })),
          count: context.suggestion_count,
          searchDays: context.search_days,
          stepMinutes: context.slot_step_minutes,
        })
      : [];

  return (
    <form action={bookMakeUp} style={{ marginBottom: "1rem" }}>
      <input type="hidden" name="class_id" value={first.class_id} />
      {group.map((token) => (
        <input key={token.id} type="hidden" name="token_id" value={token.id} />
      ))}
      <p>
        {t(lang, "makeUpWaiting", {
          className: first.classes?.name ?? t(lang, "class"),
          date: new Date(first.expires_at).toLocaleDateString(localeFor(lang), { timeZone: "Asia/Kuala_Lumpur" }),
        })}
      </p>
      {slots.length === 0 ? (
        <p>{t(lang, "noSlots")}</p>
      ) : (
        <>
          {slots.map((slot, index) => (
            <label key={slot.toISOString()} style={{ display: "block" }}>
              <input type="radio" name="slot" value={slot.toISOString()} defaultChecked={index === 0} /> {kl(slot, lang)}
            </label>
          ))}
          <button type="submit">{t(lang, "bookTime")}</button>
        </>
      )}
    </form>
  );
}

// One section per child. Row-level security limits every query to the children this account may see.
async function ChildSection({
  supabase,
  child,
  today,
  now,
  lang,
}: {
  supabase: Supabase;
  child: { id: string; full_name: string };
  today: string;
  now: Date;
  lang: Lang;
}) {
  const { data: enrolData } = await supabase.from("class_enrolments").select("class_id").eq("student_id", child.id);
  const classIds = (enrolData ?? []).map((row) => row.class_id as string);

  const { data: nextData } = await supabase
    .from("sessions")
    .select("starts_at, classes(name)")
    .in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"])
    .in("status", ["scheduled", "paused"])
    .gte("starts_at", now.toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  const next = nextData as unknown as { starts_at: string; classes: { name: string } | null } | null;

  const { data: packageData } = await supabase
    .from("student_packages")
    .select("sessions_total, carried_in, sessions_used, ends_on")
    .eq("student_id", child.id)
    .gte("ends_on", today);
  const sessionsLeft = (packageData ?? []).reduce(
    (sum, row) => sum + Number(row.sessions_total) + Number(row.carried_in) - Number(row.sessions_used),
    0,
  );

  const { data: pauseSettingsData } = await supabase.rpc("pause_settings");
  const pauseSettings = pauseSettingsData as { allowed: boolean; max_days: number } | null;
  const { data: periodData } = await supabase
    .from("student_packages")
    .select("id")
    .eq("student_id", child.id)
    .gte("ends_on", today)
    .order("ends_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentPeriodId = (periodData as { id: string } | null)?.id ?? null;
  const { data: allPeriods } = await supabase.from("student_packages").select("id").eq("student_id", child.id);
  const periodIds = (allPeriods ?? []).map((row) => row.id as string);
  const { data: pauseData } = await supabase
    .from("package_pauses")
    .select("id, starts_on, ends_on")
    .eq("status", "active")
    .gte("ends_on", today)
    .in("student_package_id", periodIds.length ? periodIds : ["00000000-0000-0000-0000-000000000000"]);
  const pauses = (pauseData ?? []) as { id: string; starts_on: string; ends_on: string }[];

  const { data: statusData } = await supabase.rpc("student_payment_status", { p_student_id: child.id });
  const paymentStatus = (statusData as string | null) ?? null;

  const { data: reportData } = await supabase
    .from("reports")
    .select("note_to_parent, sessions(starts_at)")
    .eq("student_id", child.id)
    .not("note_to_parent", "is", null);
  const latestNote = ((reportData ?? []) as unknown as { note_to_parent: string; sessions: { starts_at: string } | null }[])
    .sort((a, b) => (b.sessions?.starts_at ?? "").localeCompare(a.sessions?.starts_at ?? ""))[0];

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, amount, due_on, packages(name)")
    .eq("student_id", child.id)
    .eq("status", "unpaid")
    .order("due_on");
  const unpaid = (invoiceData ?? []) as unknown as { id: string; amount: number; due_on: string; packages: { name: string } | null }[];

  const { data: tokenData } = await supabase
    .from("make_up_tokens")
    .select("id, class_id, source_session_id, expires_at, classes(name)")
    .eq("student_id", child.id)
    .eq("status", "open")
    .gt("expires_at", now.toISOString());
  const groups = new Map<string, Token[]>();
  for (const token of (tokenData ?? []) as unknown as Token[]) {
    groups.set(token.source_session_id, [...(groups.get(token.source_session_id) ?? []), token]);
  }

  return (
    <section className="child-card">
      <h2>{child.full_name}</h2>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">{t(lang, "nextClass")}</span>
          <span className="stat-value">
            {next ? `${next.classes?.name ?? t(lang, "class")} — ${kl(next.starts_at, lang)}` : t(lang, "noClass")}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t(lang, "sessionsLeft")}</span>
          <span className="stat-value">{sessionsLeft}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t(lang, "payment")}</span>
          <span className="stat-value">
            {paymentStatus && paymentKeys[paymentStatus] ? t(lang, paymentKeys[paymentStatus]) : "-"}
          </span>
        </div>
      </div>
      {currentPeriodId ? (
        <>
          <h3>{t(lang, "pauseTitle")}</h3>
        {pauses.map((pause) => (
          <p key={pause.id}>
            {t(lang, "pausedUntil", { from: pause.starts_on, to: pause.ends_on })}{" "}
            <form action={cancelFamilyPause} style={{ display: "inline" }}>
              <input type="hidden" name="pause_id" value={pause.id} />
              <button type="submit">{t(lang, "pauseCancel")}</button>
            </form>
          </p>
        ))}
        {currentPeriodId && pauseSettings?.allowed ? (
          <form action={pausePackage}>
            <input type="hidden" name="student_package_id" value={currentPeriodId} />
            <label>
              {t(lang, "pauseFrom")}
              <input type="date" name="starts_on" defaultValue={today} required />
            </label>
            <label>
              {t(lang, "pauseTo")}
              <input type="date" name="ends_on" required />
            </label>
            <p>{t(lang, "pauseMax", { days: pauseSettings.max_days })}</p>
            <button type="submit">{t(lang, "pauseButton")}</button>
          </form>
        ) : (
          currentPeriodId && <p>{t(lang, "pauseClosed")}</p>
        )}
        </>
      ) : (
        <>
          <h3>{t(lang, "pauseTitle")}</h3>
          <p>{t(lang, "noPackage")}</p>
        </>
      )}

      <div className="note">
        <strong>{t(lang, "latestNote")}</strong>
        <p>{latestNote?.note_to_parent ?? t(lang, "noNotes")}</p>
      </div>

      <h3>{t(lang, "toPay")}</h3>
      {unpaid.length === 0 ? (
        <p>{t(lang, "nothingToPay")}</p>
      ) : (
        <ul className="records">
          {unpaid.map((invoice) => (
            <li key={invoice.id}>
              {invoice.packages?.name ?? t(lang, "package")} — RM {invoice.amount} — {t(lang, "due")} {invoice.due_on}
              <form action={payInvoice} style={{ display: "inline" }}>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <button type="submit">{t(lang, "payNow")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h3>{t(lang, "makeUps")}</h3>
      {groups.size === 0 ? (
        <p>{t(lang, "noMakeUps")}</p>
      ) : (
        await Promise.all(
          [...groups.values()].map((group) => MakeUpChoices({ supabase, group, lang })),
        ).then((forms) => forms.map((form, index) => <div key={index}>{form}</div>))
      )}
    </section>
  );
}

async function Portal({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await connection();
  const lang = await currentLang();
  const { error, saved } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  // Visible students are the children of this family, plus the account's own student record (an adult who manages themselves).
  const { data: studentData } = await supabase.from("students").select("id, full_name, account_id").order("full_name");
  const visible = (studentData ?? []) as { id: string; full_name: string; account_id: string | null }[];
  const children = visible.filter((student) => student.account_id !== me.id);
  const ownRecord = visible.find((student) => student.account_id === me.id) ?? null;
  const isFamily = await hasFamily(supabase, me.id);

  const now = new Date();
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: messageData } = await supabase
    .from("outbound_messages")
    .select("body, created_at")
    .eq("recipient_id", me.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const messages = (messageData ?? []) as { body: string; created_at: string }[];

  return (
    <>
      {saved && savedMessages[saved] && <p role="status">{t(lang, savedMessages[saved])}</p>}
      {error && <p role="alert">{error}</p>}

      {ownRecord && (
        <div key={ownRecord.id}>
          {await ChildSection({ supabase, child: ownRecord, today, now, lang })}
        </div>
      )}

      {children.length === 0 && !ownRecord && <p>{t(lang, isFamily ? "noChildren" : "noPackageYet")}</p>}
      {children.length === 0 ? null : (
        await Promise.all(children.map((child) => ChildSection({ supabase, child, today, now, lang }))).then((sections) =>
          sections.map((section, index) => <div key={children[index].id}>{section}</div>),
        )
      )}

      <h2>{t(lang, "messages")}</h2>
      {messages.length === 0 ? (
        <p>{t(lang, "noMessages")}</p>
      ) : (
        <ul className="records">
          {messages.map((message, index) => (
            <li key={`${message.created_at}-${index}`}>
              {kl(message.created_at, lang)} — {message.body}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// True when this account is a guardian of at least one family, so the page can speak to a family.
async function hasFamily(supabase: Supabase, profileId: string) {
  const { count } = await supabase
    .from("family_guardians")
    .select("family_id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  return (count ?? 0) > 0;
}

async function PortalHeading() {
  await connection();
  const lang = await currentLang();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  const family = me ? await hasFamily(supabase, me.id) : false;
  return <h1>{t(lang, family ? "portalTitle" : "portalOwnTitle")}</h1>;
}

export default function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <main>
      <Suspense fallback={<h1>My family</h1>}>
        <PortalHeading />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <Portal searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
