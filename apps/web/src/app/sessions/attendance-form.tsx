"use client";

import { useEffect, useState } from "react";
import type { AttendanceRow, AttendanceStatus } from "@/lib/attendance-save";
import { queueItem, queuedItems, removeQueuedItem } from "@/lib/offline-queue";

export type AttendanceStudent = {
  id: string;
  name: string;
  age: string;
  medicalNotes: string;
  allergies: string;
  emergencyName: string;
  emergencyPhone: string | null;
  condoPhone: string | null;
  paymentLabel: string;
  status: string;
  reason: string;
  excused: boolean;
};

type Entry = { status: string; reason: string; excused: boolean };

// Attendance for one lesson. Works with or without internet: records taken offline are kept on this phone
// and sent when the phone is back online. The coach's attendance is the record.
export function AttendanceForm({ sessionId, students }: { sessionId: string; students: AttendanceStudent[] }) {
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(students.map((s) => [s.id, { status: s.status, reason: s.reason, excused: s.excused }])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));

  // Sends everything waiting on this phone, oldest first. Stops at the first failure and keeps the rest.
  async function sendQueued(): Promise<string | null> {
    const items = await queuedItems<AttendanceRow[]>("attendance");
    let sent = 0;
    const notMarked: string[] = [];
    for (const item of items) {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: item.sessionId, rows: item.payload }),
      });
      if (!response.ok) {
        break;
      }
      const result = (await response.json()) as { blocked: { studentId: string; reason: string }[] };
      await removeQueuedItem("attendance", item.id);
      sent++;
      for (const row of result.blocked) {
        notMarked.push(`${nameOf.get(row.studentId) ?? "Student"}: ${row.reason}`);
      }
    }
    if (sent === 0) {
      return null;
    }
    return notMarked.length > 0
      ? `Saved records from this phone were sent. Not marked as attending: ${notMarked.join(" ")}`
      : "Saved records from this phone were sent.";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const rows: AttendanceRow[] = [];
    for (const student of students) {
      const entry = entries[student.id];
      if (!entry || entry.status === "") {
        continue;
      }
      if (entry.status === "absent" && entry.reason.trim() === "") {
        setMessage(`A reason is needed when ${student.name} is absent.`);
        return;
      }
      rows.push({
        student_id: student.id,
        status: entry.status as AttendanceStatus,
        reason: entry.reason.trim() === "" ? null : entry.reason.trim(),
        excused: entry.status === "absent" && entry.excused,
      });
    }

    setBusy(true);
    if (!navigator.onLine) {
      await queueItem("attendance", sessionId, rows);
      setMessage("No internet. Saved on this phone, and it will be sent when you are back online.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, rows }),
      });
      const result = (await response.json()) as { error?: string; blocked?: { studentId: string; reason: string }[] };
      if (!response.ok) {
        setMessage(result.error ?? "Attendance could not be saved.");
      } else if (result.blocked && result.blocked.length > 0) {
        setMessage(
          `Saved. Not marked as attending: ${result.blocked
            .map((row) => `${nameOf.get(row.studentId) ?? "Student"}: ${row.reason}`)
            .join(" ")}`,
        );
      } else {
        setMessage("Attendance saved.");
      }
    } catch {
      await queueItem("attendance", sessionId, rows);
      setMessage("Connection lost. Saved on this phone, and it will be sent when you are back online.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      {students.map((student) => {
        const entry = entries[student.id] ?? { status: "", reason: "", excused: false };
        return (
          <fieldset key={student.id}>
            <legend>
              {student.name} — age {student.age}
            </legend>

            <details>
              <summary>Emergency details</summary>
              <p>Medical notes: {student.medicalNotes || "-"}</p>
              <p>Allergies: {student.allergies || "-"}</p>
              <p>
                Emergency contact: {student.emergencyName || "-"}{" "}
                {student.emergencyPhone && <a href={`tel:${student.emergencyPhone}`}>call</a>}
              </p>
              {student.condoPhone && (
                <p>
                  <a href={`tel:${student.condoPhone}`}>Call the condo office</a>
                </p>
              )}
            </details>

            <p>Payment: {student.paymentLabel}</p>

            <label>
              Attendance
              <select
                value={entry.status}
                onChange={(e) => setEntries({ ...entries, [student.id]: { ...entry, status: e.target.value } })}
              >
                <option value="">Not marked</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
              </select>
            </label>
            <label>
              Reason (needed for absent)
              <input
                value={entry.reason}
                onChange={(e) => setEntries({ ...entries, [student.id]: { ...entry, reason: e.target.value } })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={entry.excused}
                onChange={(e) => setEntries({ ...entries, [student.id]: { ...entry, excused: e.target.checked } })}
              />{" "}
              Excused absence (not deducted)
            </label>
          </fieldset>
        );
      })}
      <button type="submit" disabled={busy}>
        Save attendance
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
