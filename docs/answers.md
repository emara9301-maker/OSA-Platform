# OSA Platform — Answers and Decisions

Answers from Ali (OSA) to the open questions, 25 Oct 2026. Updated with the full decision set. These override the spec (docs/spec.md) where they differ.

Every rule marked **Default** is a working value. It must be stored in Settings so OSA can change it later without a developer. Each change is logged in the audit log.

## Overall direction

- **Web first.** Build the complete web version first (coach screens, client portal, management dashboard, public website). Native mobile apps come later.
- **Many rules are "case by case".** Where OSA says "depends on the situation", build a sensible default plus a manual staff override, and log every override in the audit log.
- **PW brand:** removed. Build for OSA only.
- **Settings-driven rules.** Every number in this document (days, hours, radius, percentages, amounts) is a setting, not hard-coded.

## Waiting for files from OSA (do not build these parts until they arrive)

- Package list, prices, session counts, and whether price differs by condo.
- Group class details (minimum size, waitlist, make-ups across groups).
- Referral reward form.
- Trial / assessment form (free or paid, who runs it, how the starting level is set).

## Decisions

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Price per package or per condo | Pending: OSA will send the price list. Build price as a field on the package, with an optional per-condo override |
| 2 | Renewal payment | **Auto-renew is ON by default.** When the gateway supports recurring charges (cards, e-wallets), the renewal is charged automatically on the due date. For methods that cannot recur (DuitNow QR, FPX), the system sends a Pay now link in the renewal WhatsApp message. Each family can turn auto-renew off |
| 3 | Management on mobile | Web dashboard for now (responsive layout is fine); mobile app later |
| 4 | PW brand | Removed |
| 5 | Unused sessions at end of 30 days | Carry over to the next package. Staff can override per case |
| 6 | Pausing a package | Allowed. No fixed limits. Staff handle each case. Status "paused" stops the day counter and class bookings |
| 7 | Public holidays | **A class on a public holiday is not held. The student gets a make-up token and the session is not deducted** (same rule as rain and coach absence). Customer service and the coach first try to arrange a replacement session |
| 8 | Coach sick or absent | Head coach and customer service find a substitute. If none is found, treat it like rain (make-up token, session not deducted) |
| 9 | Group classes | Pending: OSA will send package details |
| 10 | Family invoice timing | Each child has their own package and invoice date. Siblings in the same class may be grouped on one invoice |
| 11 | Mid-package cancel / upgrade | Sessions already taken are charged at the walk-in price. The remaining value becomes credit |
| 12 | Sibling discount | 20% |
| 12b | Referral reward | Pending form |
| 13 | Trial and assessment | Pending form |
| 14 | Coach pay for rain-cancelled class | RM20, paid when the class is cancelled for rain (including after arrival) |
| 15 | Offline sync conflict | The coach's attendance wins (the class happened on the ground). The cancellation is reversed, the session is deducted, and any make-up tokens issued for it are voided. The session is flagged for review, Operations is alerted, and management can change the outcome manually (logged in the audit log) |
| 16 | QR scan location | Scans are **flagged, not blocked**. A scan outside the condo radius is saved and shown to Operations for review. **Default radius: 150 m from the condo pin**, set per condo |
| 17 | QR card | Digital only (phone wallet or screen). Children without a phone: the coach marks attendance manually with a reason. **Lost code:** customer service issues a new code, the old code is disabled immediately, and the change is logged |
| 18 | WhatsApp cost and approvals | Not needed now. Use a mock messaging service behind an interface |
| 19 | Report language | English. Other languages are a nice-to-have |
| 20 | Account deletion and data retention | Postponed until after the web version |
| 21 | App store accounts | Postponed (web first) |
| 22 | Incident log | Customer service informs parents manually by WhatsApp or email, and the system records it. See the incident fields below |
| 23 | Medical emergency in coach screens | Yes: one-tap access to emergency contact, medical notes and a call to Operations |
| 24 | KPI definitions | See the KPI formulas below (proposed; OSA to approve) |

## Other rules (from the original open-decisions list)

| Topic | Decision |
| --- | --- |
| Coach sees payment amounts? | **No.** Coach sees status only: Paid / Due soon / Overdue |
| Rain: how much counts as delivered? | **Half the class.** If the coach taught at least 50% of the class time, it counts as a session. Otherwise every student gets a make-up token |
| Make-up token validity | **90 days from issue** |
| Make-up booking for a client absence | Allowed with **at least 6 hours notice**. Notice after that is handled by customer service |
| Overdue: days before hold | **Classes go on hold on day 37** after the cycle's due date, unless a manager allows a grace period |
| Website and message languages | English and Bahasa Malaysia now. Chinese and Arabic later |
| Payment gateway | **Default: HitPay** (supports DuitNow QR, FPX, cards, e-wallets, recurring billing). Fee comparison still to be checked before launch. Built behind a gateway adapter so it can be swapped |
| Web app type | Client portal and coach app are PWAs (installable, offline-capable). Dashboard is a responsive web app |

## Incident record (fields)

- Type: injury, near-drowning, behaviour, pool hazard, other
- Severity: low / medium / high
- Student, coach, condo, date and time
- Description
- Who was informed, by what channel (WhatsApp or email), and when
- Follow-up action and owner
- Status: open / closed

## KPI formulas (proposed; OSA to approve)

- **Active students:** students whose status is active on the reporting date.
- **New students:** students whose first package starts in the period.
- **Churn (monthly):** students active at the start of the month who did not start a new package by the end of the monthly cycle, divided by students active at the start of the month. A student is not churned while paused.
- **Cash collected:** payments received in the period.
- **Revenue earned:** package price divided by its total sessions, multiplied by sessions delivered in the period (including make-ups).
- **Outstanding:** unpaid invoice balance, aged from the due date (1–7, 8–30, 31–60, 60+ days).
- **Renewals due (next 7 days):** enrolments ending within 7 days with no paid next package.
- **Attendance %:** attended sessions (present, late, make-up) divided by scheduled sessions, excluding rain-cancelled, holiday, coach-cancelled and notified absences.
- **Coach utilisation:** booked teaching hours divided by available hours (from the coach's availability).
- **Lead-to-client conversion:** leads created in the period that paid for a package within 30 days, divided by leads created in the period.
- **Report completion %:** reports submitted divided by sessions marked done.
- **Renewal rate:** students who renewed divided by students whose package was due for renewal in the period.
