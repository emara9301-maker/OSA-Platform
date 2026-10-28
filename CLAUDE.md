# OSA Platform — Project Guide

## Summary

OSA Platform is a custom system for OSA, a swim academy in Malaysia whose coaches teach at outdoor condo pools. It covers sales, client portal, coach app, management dashboard, finance, and messaging, all on one shared database.

Source documents:
- `docs/spec.md`: the full product spec.
- `docs/answers.md`: OSA's decisions. **These override the spec where they differ.**

## Guiding rule

**The condo is the centre of everything.** Every client, class, coach route, price and report can be filtered by condo. Access rules and reports must respect condo scope.

## Tech stack

- **Language:** TypeScript everywhere (strict mode).
- **Monorepo:** npm workspaces. Apps live in `apps/*`.
- **Web (Phase 1):** one Next.js app (App Router), mobile-first, installable as a PWA. It serves the public website, the client portal, the coach app and the management dashboard.
- **Backend:** Supabase (PostgreSQL, email and password auth, row-level security, storage). Local development uses the Supabase CLI and Docker.
- **Payments and WhatsApp:** mock services behind an interface for now. Real providers come later. Default gateway is HitPay (see `docs/answers.md`).
- **Tests:** Vitest.
- **Future:** a React Native (Expo) app may be added later and must reuse the shared types, business rules and API. Keep shared code outside `apps/web` when it is needed by more than one app.

## Folder structure

```
/
├── apps/
│   └── web/              Next.js app (website, portal, coach app, dashboard)
│       ├── src/app/      routes and layouts
│       ├── src/lib/      Supabase client and shared helpers
│       └── supabase/     Supabase config and SQL migrations
├── docs/                 spec.md and answers.md (source of truth)
├── package.json          workspace root and shared scripts
└── CLAUDE.md             this file
```

## Commands

Run from the repo root unless noted:

- `npm run dev`: start the web app at http://localhost:3000.
- `npm test`: run all tests. Some tests need local Supabase running.
- `npm run typecheck`: TypeScript check without emitting files.
- `npm run build`: production build.

From `apps/web`:

- `npx supabase start`: start local Supabase (requires Docker Desktop running).
- `npx supabase stop`: stop local Supabase.
- `npx supabase status`: show local URLs and keys.
- `npx supabase migration up`: apply pending migrations to the local database.

Local environment values live in `apps/web/.env.local`. Never commit that file.

## Business decisions (summary)

Full detail is in `docs/answers.md`. Key points:

- **Packages** run for 30 days, paid in advance. Unused sessions carry over unless staff override.
- **Auto-renew** is on by default. Methods that cannot recur (DuitNow QR, FPX) get a pay link each cycle.
- **Rain:** if at least half the class was taught, it counts as a session. Otherwise the student gets a make-up token (valid 90 days) and no session is deducted. Coach is paid RM20 for a rain-cancelled class.
- **Holidays and coach absence:** treated like rain (make-up token, session not deducted). Customer service and the head coach look for a replacement first.
- **Coaches see payment status only** (Paid / Due soon / Overdue), never amounts.
- **Overdue:** classes go on hold on day 37 after the due date, unless a manager allows a grace period.
- **Siblings:** each child has their own package and invoice. Sibling discount is 20%.
- **Attendance conflicts (offline):** the coach's attendance wins. The cancellation is reversed, the session is deducted, make-up tokens for it are voided, and Operations is alerted.
- **QR attendance:** scans outside the condo radius are flagged, not blocked. Default radius is 150 m, set per condo.
- **Lost QR code:** customer service issues a new code and the old one is disabled immediately.
- **Languages:** English and Bahasa Malaysia now. Chinese and Arabic later.
- **Web first.** No native mobile apps yet. PWA covers phones for now.
- **Postponed:** account deletion, app store accounts, login by phone number (email and password is used for now), trial/assessment and referral rules (waiting for OSA's forms), package prices and group class details (waiting for OSA's files).
- **Brand:** OSA only. PW is removed.

## Rules for every number and rule

Every number and threshold (days, hours, percentages, amounts, radius) is a **setting**, not a hard-coded value. Each has a sensible default and can be changed by OSA later. Manual staff overrides are allowed and must be recorded in the audit log.

## Data and security rules

- **Row-level security (RLS)** must be enabled on every table in the public schema. A table without RLS is a bug.
- Access is **role + scope**: the role decides what a person can do, the scope decides which condos, classes or students they see.
- A coach must never see a student who is not in their classes. Test this.
- Every change to money, attendance or progress is written to the **audit log** (who, what, when, before and after).
- Money and attendance logic runs on the server (database functions or server code in a transaction), never only in the browser.
- Children's data (medical notes, photos) is private. QR codes carry a random token, never the child's name.

## Coding conventions

- TypeScript strict mode. Avoid `any`.
- Match the surrounding code's style, naming and comment density.
- Keep comments short and only where the reason is not obvious.
- Each business rule gets a test.
- Keep changes small and testable. Work in the parts listed in the build plan, one at a time.

## Working rules

- **Do not start work or add anything beyond the approved part.** Propose first and wait for approval. Reading files and answering questions does not need approval.
- Do not create extra files, dependencies or features that were not approved.
- When something fails, report the actual output. Do not claim success without running the check.
- Ask the user before any action that is hard to reverse or affects shared services.

## Build plan

1. Foundation (done): repo, Next.js app, Supabase connection, test.
2. Login and roles (done): email and password login, sign-up with email confirmation, forgot-password email, roles, RLS, protected dashboard, tests. Audit log is not in this part.
3. Condos and audit log (done): owner and department heads add, edit and delete condos; coaches read only. A condo is "ready" once name, address, pool hours and contact phone are filled, otherwise "draft". Every change to condos and account roles is written to the audit log, which only the owner and department heads can read.
4. Packages and settings (done): owner and department heads manage packages (add, edit, delete) and settings; all changes are audited.
   Students (accounts that are not staff) see only their own profile at /me. Admin pages redirect non-staff accounts to /dashboard, and the dashboard shows only the links that account may open.
5. Students and families (done): owner and department heads add families and students, link guardians, assign coaches and link adult student accounts. Guardians see all their children; coaches see only assigned students; each student has a random QR code. Pickup rules and photos are not built yet.
6. Schedule and sessions (done): classes repeat every week on one weekday from a start date to an end date, in Malaysian time. Each occurrence is a session that staff can cancel one at a time. Classes have a capacity enforced by the database. Levels start from a seeded list and are editable in Settings. Coaches see their classes and the students enrolled in them. Make-ups and rain effects come in part 9.
7. Coach app: attendance (done, manual): the class coach marks each enrolled student present, late or absent per lesson. Absence needs a reason. Late is its own status. Attendance does not deduct sessions yet; link it to packages in part 10. Incident log (done): staff report, managers close, with who was informed and how. Emergency details and call links are on the lesson page. QR scanning is postponed.
8. Coach app: daily reports (done): the class coach writes one report per student per lesson. Ratings 1-5 for attitude, effort and water confidence; skill progress from a provisional list per level (editable later); improvements; problems; a note for parents; an internal note that parents never see; the next focus. The coach moves a student to the next level without head coach approval. Missing reports are counted on the staff dashboard. Report photos are not built yet (waiting for a decision).
9. Rain mode and make-up tokens (done): the coach places a weather hold, records each thunder, and resumes or cancels. A hold that passes the middle of the lesson is cancelled. A lesson that is less than half taught cancels and gives every enrolled student a make-up token (90 days). A lesson that is at least half taught counts as a session. Holidays and coach absence give tokens without coach pay. Managers book a make-up for the students holding tokens, with three suggested times on the operations board. A make-up is deducted only when the student attends (part 10). Families get messages through a mock sender that records each one.
10. Billing and payments (done, mock gateway): each child has their own invoices and 30-day packages, started by payment. Attendance deducts one session (present, late, or an unexcused absence; an excused absence is not deducted). Unused sessions carry over unless the invoice says otherwise. Renewal invoices are created 7 days before a package ends, with a reminder; a family goes on hold 37 days after the due date unless a manager allows a grace period. Coaches see Paid, Due soon or Overdue only. Attendance on a cancelled lesson reverses the cancellation, voids its tokens, and alerts operations. Auto-renew charging is not built yet (needs a recurring gateway).
11. Client portal.

Phase 2 (sales, website sign-up, promotions, WhatsApp automations, finance ageing) and Phase 3 (Swim Passport, certificates, analytics, coach pay, weather alerts) come after the pilot at two condos.
