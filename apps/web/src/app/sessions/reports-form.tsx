"use client";

import { useEffect, useState } from "react";
import type { ReportRow } from "@/lib/report-save";
import { queueItem, queuedItems, removeQueuedItem } from "@/lib/offline-queue";

export type ReportStudent = {
  id: string;
  name: string;
  attitude: string;
  effort: string;
  water: string;
  improvements: string;
  note: string;
  internal: string;
  next: string;
  move: string;
  problems: string[];
  progress: Record<string, string>;
};

type Option = { id: string; name: string };

const problemOptions = [
  ["fear", "Fear"],
  ["behaviour", "Behaviour"],
  ["health", "Health"],
  ["missing_gear", "Missing gear"],
  ["late", "Late"],
];

// Daily reports for one lesson. Works with or without internet, like attendance: records taken offline
// stay on this phone and are sent when it is back online.
export function ReportsForm({
  sessionId,
  students,
  skills,
  levels,
}: {
  sessionId: string;
  students: ReportStudent[];
  skills: Option[];
  levels: Option[];
}) {
  const [drafts, setDrafts] = useState<Record<string, ReportStudent>>(() =>
    Object.fromEntries(students.map((s) => [s.id, s])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(id: string, change: Partial<ReportStudent>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  // Sends everything waiting on this phone, oldest first. Stops at the first failure and keeps the rest.
  async function sendQueued(): Promise<string | null> {
    const items = await queuedItems<ReportRow[]>("reports");
    let sent = 0;
    for (const item of items) {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: item.sessionId, rows: item.payload }),
      });
      if (!response.ok) {
        break;
      }
      await removeQueuedItem("reports", item.id);
      sent++;
    }
    return sent > 0 ? "Reports saved on this phone were sent." : null;
  }

  useEffect(() => {
    const flush = () => {
      if (navigator.onLine) {
        void sendQueued().then((text) => text && setMessage(text));
      }
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const rows: ReportRow[] = students.map((original) => {
      const d = drafts[original.id];
      return {
        student_id: original.id,
        attitude: d.attitude ? Number(d.attitude) : null,
        effort: d.effort ? Number(d.effort) : null,
        water_confidence: d.water ? Number(d.water) : null,
        improvements: d.improvements.trim(),
        note_to_parent: d.note.trim(),
        internal: d.internal.trim(),
        next_focus_skill_id: d.next,
        move_level_id: d.move,
        problems: d.problems,
        skills: Object.entries(d.progress)
          .filter(([, value]) => value !== "")
          .map(([skillId, value]) => ({ skill_id: skillId, progress_percent: Number(value) })),
      };
    });

    setBusy(true);
    if (!navigator.onLine) {
      await queueItem("reports", sessionId, rows);
      setMessage("No internet. Reports saved on this phone, and they will be sent when you are back online.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, rows }),
      });
      const result = (await response.json()) as { error?: string };
      setMessage(response.ok ? "Reports saved." : result.error ?? "Reports could not be saved.");
    } catch {
      await queueItem("reports", sessionId, rows);
      setMessage("Connection lost. Reports saved on this phone, and they will be sent when you are back online.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      {students.map((original) => {
        const d = drafts[original.id];
        const rating = (label: string, field: "attitude" | "effort" | "water") => (
          <label>
            {label}
            <select value={d[field]} onChange={(e) => update(d.id, { [field]: e.target.value })}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        );
        return (
          <fieldset key={original.id}>
            <legend>Report: {original.name}</legend>

            {skills.map((skill) => (
              <label key={skill.id}>
                {skill.name}
                <select
                  value={d.progress[skill.id] ?? ""}
                  onChange={(e) => update(d.id, { progress: { ...d.progress, [skill.id]: e.target.value } })}
                >
                  <option value="">Not worked on</option>
                  {[0, 25, 50, 75, 100].map((p) => (
                    <option key={p} value={String(p)}>
                      {p}%
                    </option>
                  ))}
                </select>
              </label>
            ))}

            {rating("Attitude (1-5)", "attitude")}
            {rating("Effort and focus (1-5)", "effort")}
            {rating("Water confidence (1-5)", "water")}

            <label>
              Improvements today
              <textarea value={d.improvements} onChange={(e) => update(d.id, { improvements: e.target.value })} />
            </label>

            <fieldset>
              <legend>Problems</legend>
              {problemOptions.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={d.problems.includes(key)}
                    onChange={(e) =>
                      update(d.id, {
                        problems: e.target.checked ? [...d.problems, key] : d.problems.filter((p) => p !== key),
                      })
                    }
                  />{" "}
                  {label}
                </label>
              ))}
            </fieldset>

            <label>
              Note to parent
              <textarea value={d.note} onChange={(e) => update(d.id, { note: e.target.value })} />
            </label>
            <label>
              Internal note (not shown to parents)
              <textarea value={d.internal} onChange={(e) => update(d.id, { internal: e.target.value })} />
            </label>
            <label>
              Next lesson focus
              <select value={d.next} onChange={(e) => update(d.id, { next: e.target.value })}>
                <option value="">None</option>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Move to level
              <select value={d.move} onChange={(e) => update(d.id, { move: e.target.value })}>
                <option value="">Stay at current level</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        );
      })}
      <button type="submit" disabled={busy}>
        Save reports
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
