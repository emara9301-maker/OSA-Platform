# OSA Platform Structure — Website, Dashboard, Coach App & Client Portal

Oct 22, 2026 · Ali Hamdin

## Overview

OSA should build one platform with four front doors and one shared database, so a sale, a QR scan, a rain cancellation or a payment is entered once and every department sees it instantly. No copying between CRM, operations and finance sheets.

- **Website (public):** sells. Packages, promotions, condo pages, free trial or assessment booking, online sign-up and payment.
- **Client portal (parents and adult students):** mobile-first, installable on the phone. Schedule, progress, coach reports, payments, absences and make-ups.
- **Coach app:** mobile-first, works offline at the pool. Today's classes, QR attendance, rain reschedule, daily reports.
- **Management dashboard:** web. One area per department: Management, Sales & CRM, Operations, Coaching, Finance, Settings.
- **Automation engine (behind all four):** WhatsApp, email and push messages for reminders, renewals, rain notices and reports.

The guiding rule for developers: **the condo is the centre of everything.** Every client, class, coach route, price and report can be filtered by condo.

### System map (4 front doors, 1 database, 4 integrations)

- Front doors: Website (packages and promos, sign-up and pay) · Client portal (parents and adults, progress and payments) · Coach app (QR attendance, reports and rain mode) · Dashboard (Sales, Ops, Coaching, Finance, Management).
- Core: one shared database + automation engine — students, condos, classes, attendance, reports, invoices, leads, messages.
- Integrations: Payment gateway (DuitNow, FPX, cards) · WhatsApp API (reminders, reports) · Email and SMS (codes and backup) · File storage (photos and videos).

Each front door reads and writes the same records; outside services connect only through the shared core.

## Competitor research

No platform we found covers OSA's model of coaches travelling to outdoor condo pools, paid in 30-day advance packages, in Malaysia. The best ideas are spread across the references below, so OSA should combine them in one custom system.

| Reference | Type | What they do best | What OSA takes |
| --- | --- | --- | --- |
| iClassPro (USA) | Swim-school software, from US$139/month per location | Staff portal for attendance and skill checks; customer portal and branded app; make-up tokens created when a class is cancelled, with automatic expiry | Make-up token logic; staff vs office vs customer portal split |
| Jackrabbit Swim (USA) | Swim-school software | Skill tracking per swimmer; weather closures that mark a whole class absent and eligible for make-up. Users ask for built-in CRM and a real app | One-tap whole-class weather cancel; CRM built in from day one |
| Goldfish Swim School (USA franchise) | Swim school with own app | Parents mark future absences, book make-ups with tokens, see attendance; push alerts for closures; family account with several swimmers | Parent self-service absences and make-ups; family account |
| Big Blue Swim School (USA) | Swim school with own software | A demo video for every skill, written coach feedback, and a progress percentage per skill instead of pass/fail | Skill % progress and skill videos in the student profile |
| Aqua-Tots (USA, 130+ sites) | Swim school app | Digital skill card, badges, cancel and make-up in the app | Digital "Swim Passport" with badges |
| British Swim School (USA) | Swim school app | Make-up requests and promotions inside the app | Promotions shown inside the client portal |
| WestSwim (Australia) | Swim school | Clear token rules: notify 1 hour before, token valid 90 days, bookable 3 weeks ahead | Written, automatic make-up rules |
| Swim England Learn to Swim (UK) | National syllabus | Stages 1–7, each with clear outcomes, badges and certificates | Structure for OSA levels and skill checklists |
| SwimHub, SmileTutor, DSwim (Singapore) | Condo lesson providers | Coaches travel to the condo; simple monthly packages | Condo-first marketing and package pages |
| D Swim Academy, Sailfish (Malaysia) | Local swim schools | Strong brand and coaching; Sailfish runs 7 Klang Valley sites | Little visible client technology: OSA can lead here |

Gaps no competitor fills, where OSA wins:

- The condo as the main unit (location, pricing, coach route, marketing page).
- A rain workflow built for outdoor pools in a tropical climate, not an occasional closure.
- 30-day advance packages collected with Malaysian methods (DuitNow QR, FPX, e-wallets) and WhatsApp reminders.
- Sales CRM, operations, coaching and finance in one database instead of separate tools.

## What makes OSA unique

OSA's platform should feel like a premium app for parents and a time-saver for staff. These eight features are the signature of the product; developers should treat them as must-haves, not extras.

1. **Condo-first everything.** Each condo has its own page on the website ("Swimming lessons at <condo name>"), its own schedule, coaches, pool rules and price list. Parents in the same condo see group-class openings and condo group offers.
2. **Rain Mode.** One tap by the coach puts a class on weather hold, messages every parent, and if cancelled issues make-up credits and suggests three new slots automatically (details in the rain section).
3. **Swim Passport.** Every student has a live progress card: level, skill-by-skill percentage, badges, coach video clips and certificates the parent can share.
4. **60-second coach report.** Tap ratings, pick skills, add a voice note or photo. Group classes fill one form with a row per student.
5. **Smart 30-day Swim Pass.** Sessions left and days left are always visible. The renewal invoice shows what the child achieved this month, so the parent sees the value before paying.
6. **WhatsApp-first communication.** Reminders, reports and pay links go to WhatsApp, with email and app notifications as backup.
7. **Family account.** One login for several children, with one combined invoice and sibling discount rules.
8. **One live database.** Sales, operations, coaching and finance read the same record, so nothing is re-typed and every number on the dashboard is live.

## Users, roles and access

Access is controlled by **role + scope**: the role decides what a person can do, the scope decides which condos, classes or students they see. The Owner can create or change roles from a permission screen with simple on/off switches, without a developer.

| Role | Sees | Can do |
| --- | --- | --- |
| Owner / Management | Everything, all departments | Everything; manage roles; approve refunds and price changes |
| Department head (Sales, Operations, Coaching, Finance) | Their department, all condos | Manage their team; approve within their area |
| Sales / CRM staff | Leads, trials, clients, packages, promotions | Add and move leads, book trials, sell packages, send offers |
| Operations admin | Schedule, coaches, condos, rain board, make-ups | Create and move classes, assign coaches, approve reschedules |
| Finance staff | Invoices, payments, outstanding, payroll | Issue invoices, record payments, send reminders, refunds (with approval) |
| Head coach | All coaches and student progress | Approve level promotions, review report quality |
| Coach | Only their own classes and students | Attendance, reports, progress, reschedule requests |
| Parent / guardian | Only their own children | View, pay, mark absence, book make-ups, message OSA |
| Adult student | Only their own profile | Same as parent, for themselves |

Access rules for developers:

- Everyone logs in with email and password. Sign-up asks for email, phone number and password, then sends a confirmation email; the account works after the user clicks the link in it.
- "Forgot password" sends a reset email; the user chooses a new password from the link.
- Two-step login is required for Owner and Finance (planned for a later part).
- Invite by link: a manager enters a name, phone and role, and the person receives an invite.
- Every change to money, attendance or progress is saved in an audit log (who, what, when, before and after).
- Coaches see a payment status (Paid / Due soon / Overdue) on the student card. Whether they also see amounts is an OSA decision.

## Public website

The website has one job: turn a visitor into a booked trial or a paid package in under three minutes. Every page ends with two buttons: **Book a free assessment** and **WhatsApp us**.

Pages (sitemap):

1. **Home:** promise, video of a lesson, packages preview, "find your condo" search, reviews, trust badges (certified coaches, safety).
2. **Packages:** all packages as cards, with a filter for age, level and private or group.
3. **Package detail:** what is included, sessions, duration, price, which levels it suits, FAQ, Join button.
4. **Promotions:** live offers, countdown to expiry, promo code shown.
5. **Condos:** map and list of condos OSA serves; one page per condo with schedule openings, coaches and condo group offer.
6. **Levels & curriculum:** OSA levels from water confidence to stroke technique, skills per level, what certificate is earned.
7. **Coaches:** profiles, certifications, languages, photo.
8. **Reviews & results:** parent testimonials, before/after videos (with consent).
9. **About OSA and safety:** mission, water-safety message, coach training.
10. **FAQ and policies:** rain, make-up, refund, payment, safety rules.
11. **Blog / water-safety tips** (for search ranking).
12. **Join / Checkout** and **Login to portal**.

**Package card fields** (managed in the dashboard, not hard-coded): name, short pitch, age range, level range, type (private 1:1, semi-private 1:2, small group, adult), sessions per package, validity (default 30 days), session length, price, price per session, badge (Most popular / New / Promo), image, active on/off.

**Promotions engine:** promo codes and automatic offers, with rules for start and end date, discount (amount or %), which packages, which condos, first-time only, sibling, referral, usage limit. A promotion can appear as a website banner, a package badge and a client-portal card at the same time.

**Sign-up flow:**

1. Choose package (or Book free assessment).
2. Choose condo (or enter address if new condo; this creates a lead for Sales to check).
3. Child or adult details: name, date of birth, swimming experience, medical notes.
4. Choose a slot from real coach availability at that condo.
5. Pay online (DuitNow QR, FPX, card, e-wallet) or pay later for a trial.
6. Account is created automatically; WhatsApp welcome with portal link and QR card.

**Website must-haves:** English and Bahasa Malaysia (Chinese and Arabic as options); fast on mobile; WhatsApp floating button; Google reviews widget; tracking for Meta and Google ads; every form creates a lead in the CRM with its source (page, ad, referral code).

## Client portal

The client portal is a phone-first web app the parent can add to their home screen; login is email and password, with a "Forgot password" link. The home screen answers the four questions parents ask most: when is the next class, how many sessions are left, how is my child doing, and do I owe anything.

| Screen | What the parent sees and does |
| --- | --- |
| Home | A card per child: next class (date, time, coach, condo), sessions left, days left in the package, payment status, latest coach note |
| Schedule | Upcoming classes; mark absence; request reschedule; book make-up with a token |
| Swim Passport | Level, skill checklist with % per skill, badges, coach video clips, certificates to download and share |
| Reports | Feed of daily coach reports (only the parent-visible parts) with photos |
| Attendance | History: present, absent, rain-cancelled, make-up used |
| Payments | Current invoice with Pay now; history; receipts; auto-renew on/off; saved payment method |
| Packages & offers | Renew, upgrade, add a sibling, live promotions, referral code and rewards |
| Profile | Children's details, medical notes, emergency contacts, condo and unit, consents (photo/video, terms) |
| Messages | Chat with OSA office; notification settings (WhatsApp, email, app) |
| QR card | The child's QR code for attendance, saved to phone wallet or printed |

Adult students see the same screens for themselves. A parent can add a second guardian (for example the other parent or a helper) with view-only or full access.

## Coach app

The coach app is built for one hand, wet fingers and weak signal at the pool: big buttons, very few screens, and it keeps working offline, sending data when the signal returns.

Screens:

1. **Today:** classes in time order grouped by condo, with travel order, pool notes (access card, lift, parking) and a Start class button.
2. **Class:** student list with photo, age, level, package (sessions left, days left), payment status, medical alerts in red, and today's focus from the last report.
3. **Attendance:** scan each student's QR code. The scan records time and the phone's location, and is checked against the class's condo. Manual tick is allowed with a reason (forgot card), and Operations sees manual ticks.
4. **Rain / reschedule:** Weather hold, Cancel (rain or thunder), Late start, or Propose new time (see the rain section). Changes go straight to the Operations rain board and the parents.
5. **Daily report:** per student, or a group form with one row per student.
6. **Student profile:** everything in the student profile section except internal finance details; progress history; previous reports.
7. **My schedule & availability:** weekly timetable, block unavailable times, request leave, swap a class with another coach (Operations approves).
8. **My stats:** sessions taught, report completion %, attendance rate of my students, renewals of my students, and pay summary if OSA turns it on.

Daily report fields (per student):

| Field | Input | Parent sees it? |
| --- | --- | --- |
| Attendance | From QR scan; present / late / absent / rain-cancelled | Yes |
| Level and skills worked on | Tap from the level's skill list | Yes |
| Skill progress | Slider per skill: 0–100% or Not started / Learning / With help / Mastered | Yes |
| Attitude | 1–5 faces | Yes |
| Effort and focus | 1–5 | Yes |
| Water confidence | 1–5 | Yes |
| Improvements today | Short text or voice note | Yes |
| Problems / concerns | Pick list (fear, behaviour, health, missing gear, late) + text | Choice per item |
| Note to parent | Text | Yes |
| Internal note for OSA | Text | No |
| Photo / video | Up to 3 files (only if photo consent is on) | Yes |
| Next lesson focus | Pick skills | Yes |
| Recommend level-up | Yes / No | No, until approved |

A report is due by the end of the day; the dashboard flags missing reports. Optional later: the voice note is turned into a written summary automatically, and the coach confirms before it is sent.

## Management dashboard

The dashboard opens on the department of the person logged in; the Owner sees a Management view with every department as a tab. Every number is clickable down to the list of students or invoices behind it, and every list can be filtered by condo, coach, package and date and exported to Excel.

| Department | Main screens | Key numbers on its home |
| --- | --- | --- |
| Management (Owner) | Company overview; condo performance; coach performance; alerts | Active students, new students, revenue this month, cash collected, outstanding, renewals due next 7 days, churn, attendance %, coach utilisation, lead-to-client conversion |
| Sales & CRM | Lead pipeline board (New → Contacted → Assessment booked → Assessment done → Offer sent → Won / Lost); lead profile with full history; follow-up tasks; WhatsApp inbox; promotions and promo codes; referrals; renewal pipeline | New leads, leads by source, conversion %, trials this week, follow-ups overdue, renewals at risk |
| Operations | Master calendar (by coach, condo, day); class capacity; rain board; make-up queue; coach assignment and substitutes; condo directory (address, pool hours, rules, contact, access); incidents log | Classes today, unassigned classes, rain-cancelled today, make-ups pending, coach clashes |
| Coaching | Coach list; report completion; student progress by level; level-up approvals; certificates; coach certifications and expiry dates; quality checks | Reports missing, students stuck at a level for 3+ months, level-ups waiting |
| Finance | Invoices; payments; outstanding with ageing; reminders; credits and refunds; coach pay and commission; expenses; exports to accounting | Collected today/month, outstanding by age, renewals due, failed payments, payroll due |
| Settings | Packages and prices; levels and skills; condos; promotions; roles and permissions; message templates; policies; company details | — |

**CRM client record (the 360° view):** contact details, children, condo, lead source, every message and call, trials, packages bought, payments, attendance, coach reports, complaints and notes, tags (VIP, sibling, at risk), and the next action with an owner and due date.

## Student profile and progress

The student profile is the single record that sales, coaches, operations and finance all read; each role sees only the groups it is allowed to.

| Group | Fields | Who sees it |
| --- | --- | --- |
| Identity | Full name, nickname, photo, date of birth (age calculated), gender, language spoken, student ID, QR code | All staff, parent |
| Guardians & contacts | Parent/guardian names, phone (WhatsApp), email, relationship, second guardian, emergency contact, who picks up the child | Staff, parent |
| Location | Condo name, block/unit, pool location in the condo, access notes | Staff, parent |
| Health & safety | Medical conditions, allergies, asthma/epilepsy flags, medication, fear of water level, special needs, doctor note upload | Coach, operations, parent |
| Swimming | Current level, start level, start date, skills %, badges, certificates, level history, goals (water safety, strokes, competition) | All staff, parent |
| Package | Package type, start date, end date (start + 30 days), sessions total / used / left, make-up tokens, auto-renew on/off, price and discount | Staff (coach: sessions and dates only), parent |
| Schedule | Fixed weekly slot(s), assigned coach, class (private / group), upcoming classes | Staff, parent |
| Attendance | Every session: present, late, absent (notified or not), rain-cancelled, make-up | Staff, parent |
| Payments | Invoices, paid date, method, outstanding, payment status | Finance, management; coach sees status only; parent |
| Reports | All daily coach reports | Staff; parent sees parent-visible parts |
| Sales & CRM | Lead source, sales owner, referral code, tags, satisfaction score, complaints | Sales, management |
| Consents | Terms accepted, photo/video consent, data consent (PDPA), date accepted | Staff, parent |
| Internal notes | Free notes with author and date | Staff only |

Progress model:

- OSA defines its levels in Settings (for example Water Confidence, Beginner 1–2, Intermediate 1–2, Advanced, Stroke Development, Adult), each with a list of skills and the outcome needed, following the stage-and-outcome idea of the Swim England framework.
- Each skill has a progress value set by coaches in reports. When all core skills of a level are Mastered, the coach can recommend a level-up; the head coach approves.
- On approval the system creates a certificate with the child's name and photo, adds a badge to the Swim Passport, and sends it to the parent.
- Progress charts show skills over time, attendance %, and average attitude and confidence ratings.

## Package and payment cycle

Every package runs for 30 days from its start date and is paid in advance; the system invoices, reminds and reconciles automatically so Finance only handles exceptions.

The 30-day cycle:

1. **Day 0:** package starts after payment is confirmed. Sessions and the 30-day end date are set.
2. **Day 23 (7 days before end):** renewal invoice is created and sent by WhatsApp with a Pay now link and a short progress summary.
3. **Day 27 (3 days before):** first reminder if unpaid.
4. **Day 30 (due date):** second reminder; Sales sees the client in "Renewals at risk".
5. **Day 31 and Day 33:** overdue reminders; coach card shows Overdue.
6. **Day 37:** final notice; classes go on hold unless a manager allows a grace period. Every day number here is a setting OSA can change.
7. **Payment received:** next package starts the day after the current one ends, so there are no gaps.

**Payment methods:** DuitNow QR, FPX online banking, cards and e-wallets (Touch 'n Go, GrabPay, ShopeePay, Boost) through one payment gateway. Paid online = marked Paid automatically by the gateway's confirmation. Bank transfer = parent uploads proof, Finance confirms with one click.

**Invoice statuses:** Draft · Sent · Partly paid · Paid · Overdue · Cancelled · Credited/Refunded.

Finance screens:

- Outstanding list with ageing: 1–7 days, 8–30, 31–60, 60+ days; each row has a Send reminder button and a call log.
- Bulk reminder: select clients, pick a template, send by WhatsApp and email.
- Collections forecast: renewals due in the next 7 and 30 days.
- Revenue by condo, package, coach and month; cash collected vs revenue earned.
- Credits: unused sessions from OSA-side cancellations become make-up tokens, not refunds, unless a manager approves a refund.
- Coach pay: sessions taught × rate, plus commission rules (for example per renewal), approved monthly and exported.
- Export to Excel and to the accounting software, with the same categories as OSA's bank-statement workbook (Salary & Commission, supplier invoices, etc.) so the bank reconciliation stays easy.

**e-Invoice:** from 1 September 2026, businesses with annual sales under RM3 million are not required to issue LHDN e-invoices. OSA's bank data shows about RM1.05 million revenue in the last 12 months, so it is currently exempt, but the invoice table should keep the fields MyInvois needs (TIN, ID, line items, tax) so it can be switched on later.

## Rain and weather reschedule

OSA's pools are outdoor, so rain is a daily operation, not an exception. The common international rule is to leave the pool when thunder or lightning occurs and wait 30 minutes after the last one; light rain alone usually does not stop a lesson if the coach can see the bottom of the pool.

Flow:

1. Coach taps **Weather hold** on the class. Parents get an instant WhatsApp: "Class paused for thunder, we will update you in 30 minutes."
2. Each new thunder resets the 30-minute timer in the app.
3. If the hold passes the halfway point of the class, or the coach taps Cancel, the class is cancelled.
4. If at least half the class was taught, it counts as a session (policy setting); otherwise every student gets a make-up token and the session is not deducted.
5. The system suggests three make-up slots using the same coach and condo, the coach's free time and the pool's hours. The parent picks one in the portal, or Operations assigns it.
6. A coach can also propose a new time directly; it needs Operations approval if it clashes with another class.
7. Make-up tokens expire a set number of days after the package ends (OSA decides); the package end date can also be extended automatically instead.

**Operations rain board:** a live list of today's held and cancelled classes, make-ups waiting for a slot, coaches free now, and parents who have not answered. Optional later: a weather feed that warns Operations the evening before when heavy rain or thunder is forecast for a condo's area.

## Automations and notifications

All messages use templates editable in Settings, in the client's language, sent on WhatsApp first with email and app notification as backup.

| Trigger | Message | To |
| --- | --- | --- |
| New lead from website or ads | Welcome + book-assessment link; task for Sales within 15 minutes | Lead, Sales |
| Assessment booked / day before | Confirmation, coach name, what to bring | Parent, coach |
| Package paid | Welcome, schedule, QR card, portal link | Parent |
| Day before each class | Reminder with time, coach, condo | Parent |
| Weather hold / cancel | Hold notice; then cancel notice with make-up options | Parents of that class, Operations |
| Daily report submitted | "New report from Coach X" with link | Parent |
| Report missing by end of day | Reminder; next morning alert to head coach | Coach, Coaching head |
| Level-up approved | Certificate and badge | Parent |
| 3 sessions left / 7 days left | Renewal reminder with progress summary and Pay now | Parent, Sales |
| Invoice overdue | Reminder ladder (see payment cycle) | Parent, Finance |
| Absent twice without notice | Check-in message; task for Sales | Parent, Sales |
| Student stuck at a level 3+ months | Review task | Head coach |
| Coach certification expiring in 30 days | Renewal reminder | Coach, Coaching head |
| Monthly | Progress summary per child | Parent |

## Data model

These are the main tables and how they connect; developers can add technical fields, but the names and links below should stay so every department shares the same meaning.

| Table | Key fields | Links to |
| --- | --- | --- |
| Family (account) | Name, phones, email, language, address, referral code, tags | Guardians, Students, Invoices |
| Guardian | Name, phone, email, relationship, access level | Family |
| Student | Name, DOB, photo, medical, level, QR token, status (lead / trial / active / paused / left) | Family, Condo, Enrolments, Reports |
| Lead | Contact, child info, source, stage, owner, next action, lost reason | Family (when won), Condo, Promotions |
| Condo | Name, address, map pin, pool hours, rules, access notes, contact, area | Classes, Students, Coaches |
| Coach (staff) | Name, phone, certifications + expiry, rates, availability, condos covered | Classes, Reports, Payroll |
| Package (product) | Name, type, sessions, validity days, length, price, levels, ages, active | Enrolments, Promotions |
| Enrolment (a bought package) | Student, package, start, end, sessions used/left, price paid, discount, auto-renew | Student, Package, Invoice, Sessions |
| Class (slot) | Condo, coach, day/time, type, capacity, level | Sessions, Enrolments |
| Session (one lesson) | Date, time, class, status (scheduled / done / rain hold / cancelled / make-up) | Attendance, Reports |
| Attendance | Session, student, status, scan time, location, method (QR / manual) | Session, Student |
| Make-up token | Student, reason, issued, expiry, used on session | Student, Session |
| Report | Session, student, coach, ratings, skills progress, notes (parent / internal), media | Session, Student, Coach |
| Level & Skill | Level name, order, skills, outcome text, video | Student progress |
| Invoice & Payment | Number, family, lines, total, due date, status, method, gateway reference | Family, Enrolment |
| Promotion | Code, rule, dates, limits, packages, condos | Enrolments, Leads |
| Message log | Channel, template, to, sent, delivered, read | Family, Lead |
| Audit log | User, action, record, before, after, time | All |

## Tech stack and integrations (original recommendation)

We recommend a custom build rather than buying iClassPro or Jackrabbit, because neither is built around condos, Malaysian payment methods, WhatsApp-first messaging or a full sales CRM. The stack below is a recommendation; the developers can propose equivalents. (See docs/answers.md for the stack actually decided.)

| Part | Recommendation | Why |
| --- | --- | --- |
| Website | Next.js (React), server-rendered | Fast, good for Google ranking, shares code with the dashboard |
| Client portal & coach app | Progressive web app (installable, offline), one codebase; native iOS/Android later if needed | One build for all phones; offline QR scanning at the pool |
| Dashboard | Same React codebase, role-based screens | One login system, one design |
| Backend & database | PostgreSQL with an API layer (for example NestJS, or Supabase for speed) | Reliable for money and attendance; row-level security per role |
| Login | Email + password for everyone; email confirmation on sign-up; password reset by email; two-step for Owner/Finance later | Familiar, works without an SMS provider |
| Payments | A Malaysian gateway with DuitNow QR, FPX, cards, e-wallets, recurring billing and payment confirmations to our system (for example HitPay, Billplz, iPay88 or Stripe) | Auto-mark invoices paid |
| WhatsApp | WhatsApp Business Platform (official API) with approved templates | Reminders, reports, rain notices |
| Email / SMS | A transactional email service (confirmation and password reset emails); SMS later | Backup channels |
| Files | Cloud storage for photos and videos, private links | Reports and Swim Passport media |
| Hosting | Cloud region in Singapore or Malaysia, daily backups | Speed and data location |
| Analytics | Google Analytics + Meta pixel on the website; dashboard KPIs from the database | Ad tracking and lead source |

**Security and privacy:** follow Malaysia's Personal Data Protection Act (children's data, medical notes and photos need consent and restricted access); encrypt data; QR codes carry a random token, never the child's name; media visible only to that family and staff.

## Build phases and acceptance checklist

Build the operations core first so coaches and finance stop using spreadsheets, pilot it at two condos, then add the selling and delight layers. The website can be designed in parallel during Phase 1 and launched when sign-up and payment are ready.

- **Phase 1 · Foundation:** roles, condos, packages; student profiles, schedule; coach app: QR and reports; rain mode and make-ups; client portal and payments. **Gate: pilot at 2 condos.**
- **Phase 2 · Sell and grow:** website and sign-up flow; sales CRM pipeline; promotions and referrals; WhatsApp automations; finance ageing and exports. **Gate: all condos live.**
- **Phase 3 · Delight:** Swim Passport and badges; certificates on level-up; management analytics; coach pay and commission; weather alerts, voice notes.

The developers should give their own time estimate per phase after reading this document.

OSA accepts a phase when:

- [ ] A coach can scan a full class's QR codes in under 1 minute, also with no signal.
- [ ] A rain cancellation reaches every parent of that class on WhatsApp within 1 minute and creates make-up tokens.
- [ ] A daily report for a group of 4 takes the coach under 3 minutes.
- [ ] A parent can pay a renewal from the WhatsApp link in under 1 minute, and the invoice turns Paid without Finance touching it.
- [ ] The outstanding list matches the payment gateway and bank records to the ringgit.
- [ ] A coach cannot open a student who is not in their classes.
- [ ] Every dashboard number opens the list behind it and exports to Excel.
- [ ] A visitor can go from the home page to a booked assessment in under 3 minutes on a phone.

## Decisions OSA needs to confirm (original list)

- [ ] Final list of packages, prices, session counts and group sizes.
- [ ] OSA level names and the skills in each level.
- [ ] Do coaches see payment amounts, or only Paid / Due / Overdue? (Recommended: status only.)
- [ ] Rain rule: how much of a class counts as delivered (recommended: half), and how long make-up tokens stay valid.
- [ ] Make-up rule for client absences: allowed with notice (how many hours before?) or not.
- [ ] Overdue rule: how many days before classes go on hold.
- [ ] Languages for website and messages (English, Bahasa Malaysia, Chinese, Arabic?).
- [ ] Are OSA and PW separate brands on the website, or one platform with two business units?
- [ ] Which payment gateway (compare fees for DuitNow QR and FPX).
- [ ] Progressive web app first, or native iOS/Android apps from day one.
- [ ] Coach pay and commission rules to show in the coach app.
- [ ] Moving current client, package and payment data from existing sheets into the new system.
