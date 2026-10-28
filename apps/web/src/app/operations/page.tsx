import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { resolveAlert, scheduleMakeUp } from "./actions";
import { canManageCondos, homePathFor } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";
import { parsePoolHours, suggestMakeUpSlots, type Busy } from "@/lib/make-ups";

const minute = 60 * 1000;
const day = 24 * 60 * minute;
const searchDays = 14;
const kl = (value: string | Date) =>
  new Date(value).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });

// Start of today in Malaysia, as a UTC instant.
function startOfTodayInMalaysia(now: Date) {
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 8 * 60 * 60 * 1000;
}

type Token = {
  id: string;
  student_id: string;
  class_id: string;
  source_session_id: string;
  expires_at: string;
  students: { full_name: string } | null;
};

async function Board({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await connection();
  const { error, saved } = await searchParams;
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!canManageCondos(me.role)) {
    redirect(homePathFor(me.role));
  }

  await supabase.rpc("settle_weather_holds");

  const now = new Date();
  const todayStart = startOfTodayInMalaysia(now);
  const todayEnd = todayStart + day;

  const { data: todayData } = await supabase
    .from("sessions")
    .select("id, starts_at, status, cancel_reason, rain_stopped, classes(name)")
    .gte("starts_at", new Date(todayStart).toISOString())
    .lt("starts_at", new Date(todayEnd).toISOString())
    .order("starts_at");
  const today = (
    (todayData ?? []) as unknown as {
      id: string;
      starts_at: string;
      status: string;
      cancel_reason: string | null;
      rain_stopped: boolean;
      classes: { name: string } | null;
    }[]
  ).filter((row) => row.status === "paused" || row.status === "cancelled" || row.rain_stopped);

  const { data: tokenData } = await supabase
    .from("make_up_tokens")
    .select("id, student_id, class_id, source_session_id, expires_at, students(full_name)")
    .eq("status", "open")
    .gt("expires_at", now.toISOString());
  const tokens = (tokenData ?? []) as unknown as Token[];

  const groups = new Map<string, Token[]>();
  for (const token of tokens) {
    groups.set(token.source_session_id, [...(groups.get(token.source_session_id) ?? []), token]);
  }

  const classIds = [...new Set(tokens.map((t) => t.class_id))];
  const sourceIds = [...groups.keys()];
  const none = ["00000000-0000-0000-0000-000000000000"];
  const { data: classData } = await supabase
    .from("classes")
    .select("id, name, coach_id, duration_minutes, condos(pool_hours)")
    .in("id", classIds.length ? classIds : none);
  const classes = new Map(
    ((classData ?? []) as unknown as {
      id: string;
      name: string;
      coach_id: string;
      duration_minutes: number;
      condos: { pool_hours: string | null } | null;
    }[]).map((row) => [row.id, row]),
  );

  const { data: sourceData } = await supabase
    .from("sessions")
    .select("id, starts_at")
    .in("id", sourceIds.length ? sourceIds : none);
  const sourceStart = new Map(((sourceData ?? []) as { id: string; starts_at: string }[]).map((row) => [row.id, row.starts_at]));

  const coachIds = [...new Set([...classes.values()].map((c) => c.coach_id))];
  const { data: upcomingData } = await supabase
    .from("sessions")
    .select("starts_at, ends_at, classes!inner(coach_id)")
    .in("status", ["scheduled", "paused"])
    .in("classes.coach_id", coachIds.length ? coachIds : none)
    .gt("ends_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + searchDays * day).toISOString());
  const busyByCoach = new Map<string, Busy[]>();
  for (const row of (upcomingData ?? []) as unknown as {
    starts_at: string;
    ends_at: string;
    classes: { coach_id: string };
  }[]) {
    const list = busyByCoach.get(row.classes.coach_id) ?? [];
    list.push({ start: new Date(row.starts_at), end: new Date(row.ends_at) });
    busyByCoach.set(row.classes.coach_id, list);
  }

  const { data: coachData } = await supabase.from("profiles").select("id, username, full_name").eq("role", "coach").eq("is_active", true);
  const { data: runningData } = await supabase
    .from("sessions")
    .select("classes!inner(coach_id)")
    .in("status", ["scheduled", "paused"])
    .lte("starts_at", now.toISOString())
    .gt("ends_at", now.toISOString());
  const runningCoachIds = new Set(
    ((runningData ?? []) as unknown as { classes: { coach_id: string } }[]).map((row) => row.classes.coach_id),
  );
  const freeCoaches = ((coachData ?? []) as { id: string; username: string | null; full_name: string }[]).filter(
    (coach) => !runningCoachIds.has(coach.id),
  );

  const { data: alertData } = await supabase
    .from("operation_alerts")
    .select("id, body, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  const alerts = (alertData ?? []) as { id: string; body: string; created_at: string }[];

  const { data: messageData } = await supabase
    .from("outbound_messages")
    .select("body, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const messages = (messageData ?? []) as { body: string; created_at: string }[];

  return (
    <>
      {saved === "1" && <p role="status">Make-up lesson booked.</p>}
      {saved === "alert" && <p role="status">Alert closed.</p>}
      {error && <p role="alert">{error}</p>}

      <h2>Alerts to review</h2>
      {alerts.length === 0 ? (
        <p>No open alerts.</p>
      ) : (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.id} style={{ marginBottom: "0.5rem" }}>
              {kl(alert.created_at)} — {alert.body}
              <form action={resolveAlert} style={{ display: "inline" }}>
                <input type="hidden" name="alert_id" value={alert.id} />
                <button type="submit">Mark reviewed</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2>Lessons today</h2>
      {today.length === 0 ? (
        <p>No paused or cancelled lessons today.</p>
      ) : (
        <ul>
          {today.map((row) => (
            <li key={row.id}>
              {kl(row.starts_at)} — {row.classes?.name ?? "class"} — {row.status}
              {row.cancel_reason ? ` (${row.cancel_reason})` : ""}
              {row.status === "done" && " (rain, counted as a session)"}
            </li>
          ))}
        </ul>
      )}

      <h2>Make-up lessons waiting for a time</h2>
      {groups.size === 0 ? (
        <p>No make-up tokens are waiting.</p>
      ) : (
        [...groups.entries()].map(([sourceId, group]) => {
          const classInfo = classes.get(group[0].class_id);
          if (!classInfo) {
            return null;
          }
          const pool = parsePoolHours(classInfo.condos?.pool_hours ?? null);
          const slots = pool
            ? suggestMakeUpSlots({
                now,
                minNoticeHours: 6,
                durationMinutes: classInfo.duration_minutes,
                pool,
                busy: busyByCoach.get(classInfo.coach_id) ?? [],
                count: 3,
                searchDays,
              })
            : [];
          const expires = group.map((t) => t.expires_at).sort()[0];
          return (
            <form key={sourceId} action={scheduleMakeUp} style={{ marginBottom: "1.5rem" }}>
              <input type="hidden" name="class_id" value={classInfo.id} />
              {group.map((token) => (
                <input key={token.id} type="hidden" name="token_id" value={token.id} />
              ))}
              <p>
                <strong>{classInfo.name}</strong>, lesson of {kl(sourceStart.get(sourceId) ?? now)} was cancelled. Tokens
                expire {new Date(expires).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}.
              </p>
              <p>Students: {group.map((t) => t.students?.full_name ?? "student").join(", ")}</p>

              {!pool && <p>Set the pool hours on the condo to get suggested times.</p>}
              {pool && slots.length === 0 && <p>No free time in the next {searchDays} days.</p>}
              {slots.map((slot, index) => (
                <label key={slot.toISOString()} style={{ display: "block" }}>
                  <input type="radio" name="slot" value={slot.toISOString()} defaultChecked={index === 0} /> {kl(slot)}
                </label>
              ))}
              <label style={{ display: "block" }}>
                Or another time (Malaysia)
                <input type="datetime-local" name="manual_time" />
              </label>
              <label style={{ display: "block" }}>
                <input type="checkbox" name="ops_approved" /> Operations approves a clash with the coach&apos;s other lesson
              </label>
              <button type="submit">Book make-up lesson</button>
            </form>
          );
        })
      )}

      <h2>Coaches free now</h2>
      {freeCoaches.length === 0 ? (
        <p>No coach is free right now.</p>
      ) : (
        <ul>
          {freeCoaches.map((coach) => (
            <li key={coach.id}>{coach.username ?? coach.full_name}</li>
          ))}
        </ul>
      )}

      <h2>Messages sent to families</h2>
      {messages.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ul>
          {messages.map((message, index) => (
            <li key={`${message.created_at}-${index}`}>
              {kl(message.created_at)} — {message.body}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <main>
      <h1>Operations</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
