# ORCA Admin Web

Internal ORCA Rehab Admin Dashboard frontend (Next.js + TypeScript). It answers one question first:
**"How is provider documentation doing, and who needs attention?"**

It runs at **admin.orcarehab.com** (Vercel project from this repo, root directory `frontend`). Its data comes
from the shared ORCA API (`ORCA_Careers_API`), which now hosts the dashboard pipeline that used to live in
`../backend`. The employee portal links to it from an Admin-only "Operations" app tile.

## Run locally

```bash
cp .env.example .env.local     # fill in ORCA_API_URL/KEY, Google client, AUTH_SECRET
npm install
npm run dev                    # http://localhost:3000
```

```bash
npm test          # unit tests (formatting, attention criteria)
npm run lint
npm run typecheck
npm run build
```

## Sign-in and data access

- **Sign-in:** Google (Auth.js), using the employee portal's OAuth client, limited to the ORCA Workspace domain.
  The Google ID token is exchanged at `POST /v1/identity/sessions` on the ORCA API with this app's key; only people
  with the **ADMIN**, **HR** or **HIM** role get in. Roles are re-checked every minute, and the session ends if the person loses all three.
- **Data:** the browser calls this app's own `/api/dashboard/{providers,scribes}` and `/api/schedule/*`. Those routes run on the server and
  call the ORCA API with this app's key (`ORCA_API_KEY`, which is `ADMIN_API_KEY` in the API) plus the admin's user
  token. The API checks `dashboard.read` (ADMIN) on every request. No key or token ever reaches the browser.
- **New admin features** (editing data and so on) should be added as API routes that check the role and record the
  actor, then called from here the same way. This app never connects to the database directly.

## Structure

```
src/
  app/
    layout.tsx                  html/body only
    sign-in, access-denied      Google sign-in and refusal pages
    api/dashboard/[resource]    server-side calls to the ORCA API
    (dashboard)/layout.tsx      shell: navigation + main, requires a session
    (dashboard)/page.tsx        Overview: summary, Needs attention, provider table
    providers/page.tsx          provider table with search
    providers/[name]/page.tsx   provider detail
    scribes/page.tsx            scribe production: scope, summary, scribe table, weekly/monthly table
    scribes/[name]/page.tsx     scribe detail with daily/weekly/monthly production
    (dashboard)/schedule/       Operations schedule: weekly board (?week=YYYY-MM-DD&view=facilities)
    api/schedule/               board (one week + roster + facilities), assignments, assignments/[id], copy-week
  components/
    Nav.tsx                     Overview / Providers / Scribes / Schedule live; Facilities / ORCA AI shown as "Soon"
    schedule/                   ScheduleScreen (toolbar, notices), ScheduleBoard (both views), AssignmentEditor (dialog)
    ui.tsx                      PageHeader, MetricStrip, Section, SourceNote, Loading/Error states
    DataTable.tsx               generic table (providers, scribes; facilities later)
    providers/                  provider-specific pieces (summary, attention list, table, completion cell)
    scribes/                    scribe-specific pieces (summary, table, production table, scope line)
    DataFreshness.tsx           "Tracker read …" + refresh
  lib/
    api.ts                      same-origin fetch client + ApiError
    types.ts                    API contract (fields the UI uses)
    useDashboardResource.ts     generic data hook (shows last data while revalidating)
    useProviderDashboard.ts / useScribeDashboard.ts
    periods.ts                  day/week/month labels clipped to the reporting period
    attention.ts                Needs attention criteria (explicit, not a score)
    format.ts                   number/percent/day formatting; missing values → "—"
    apiRoute.ts                 server helpers for /api routes: user token, error mapping (keeps conflict/warning details)
    schedule/                   schedule types, Monday weeks (week.ts), labels, board projections (board.ts), client + hook
```

## UI rules

- **No overall completion percentage without coverage.** The summary shows Expected, Completed, Outstanding and **Status coverage**.
- **Completion** = completed ÷ classified (notes with a known status). **Status coverage** = classified ÷ expected. They always appear next to each other. A caution dot marks completion rates where coverage is below 90%, and the tooltip says what the rate is based on.
- **Unknown status is not outstanding.** The detail page lists them separately and explains the difference.
- A `null` rate is shown as `—`, never `0%`.
- **Needs attention** lists a provider when it meets any explicit criterion: top 5 by outstanding notes, an outstanding batch 30+ days old, status coverage below 90%, or source data that needs review. The reasons are printed, the backend order is kept, and the criteria are listed under the section. Thresholds live in `src/lib/attention.ts`.
- **Parser diagnostics stay out of the admin UI.** Providers with `dataStatus: "incomplete"` or flagged rows get a subtle "Some source data needs review". Details belong in a future data-quality view.
- **Scribes are descriptive, not evaluative.** They're listed alphabetically, with no targets, rankings or completion. Notes uploaded sits beside notes produced and is never compared with it. The reporting period (V1 starts Aug 1, 2026) is always stated.
- No charts yet. Neutral surfaces, one accent, one caution color, light and dark themes (`globals.css` tokens).

## Schedule (Operations)

The provider schedule lives in the ORCA API (`schedule_assignments`, `/v1/schedule`); this app manages it and the employee portal shows each provider their own ("My Schedule"). There is one copy of the data.

- **Board.** A week (Monday–Sunday) of entries. **Providers** view: a row per provider, a column per day. **Facilities** view: the same entries by facility, with admin/clinic/PTO/off entries in a "Not at a facility" row. Rows show who has entries that week; **Show all** adds every current provider (physician, NP/PA), or every facility that is active or whose operational status isn't recorded yet (inactive and prospective ones stay selectable in the editor). Search, provider and facility filters narrow either view.
- **Entries.** Click a chip to edit or delete it; click empty space in a cell to add one for that row and day; **+ Add entry** for anything else. Types: facility, coverage (optionally naming who is covered), admin, clinic, PTO, off. Times: AM, PM, all day, or custom hours. Notes are operational only, never patient information.
- **Clashes** are decided by the API (ORCA_Backend_API `src/schedule/rules.ts`). Conflicts can't be saved and are explained in the editor; warnings (all-day overlap, inactive facility or provider, facility outside the provider's standing assignments) show first and save with **Save anyway**.
- **Copy previous week** fills only the provider-days that are empty this week; nothing is overwritten.
- **Data.** `GET /api/schedule/board` makes three ORCA API reads in parallel (the week's entries, `/v1/org/staff`, `/v1/org/facilities`) and returns one response, so names and facilities always come from the canonical organization records. The ORCA API lets this app read `/v1/org` (GET only) and manage `/v1/schedule` with ADMIN (`schedule.read_all`, `schedule.write`).
- **Tests:** `src/lib/schedule/schedule.test.ts` (weeks, labels, and that both views draw the same entries).

## Employees and Facilities

- **Position and Access are separate.** Position is someone's job (the staff record's category). Access is the roles on their sign-in account, which decide what they can see in ORCA apps. Admins set Access, and can turn an account off, on the employee's profile. There's no separate People & Roles page any more: `/people` redirects to **Employees → Accounts without a record**. That admin-only view lists sign-in accounts that aren't linked to any employee. There an admin can create the employee record (prefilled; saving it links the account and keeps its roles), edit the account's roles, or turn the account off.
- **Facility assignments** show on both sides: an employee's facilities on their profile, and a facility's assigned staff on its page. Anyone allowed to write a type gets **+ Assign** and **End** for it, matching the ORCA API: rounding provider and liaison are HIM or Admin; scribe coverage, credentialed and other are HR or Admin (`assignmentTypesFor` in `lib/access.ts`). Ending an assignment keeps it as history. Assignments imported from a master spreadsheet can't be ended here; the API says so.

## Send to QuickBooks Time

The schedule board's **Send to QuickBooks Time** button (admins) opens a dialog for the week on
screen. The first time (or if QuickBooks Time ever stops accepting the connection) it offers
**Connect QuickBooks Time**: the admin approves access on QuickBooks Time's own page and is sent
back to `/api/quickbooks-time/callback`, which hands the code to the ORCA API. After that the
ORCA API keeps the connection renewed by itself; this app never holds a token. It first shows a preview from the ORCA API: how many events will be added, updated and
removed, what isn't sent (PTO, Off, Admin, Clinic), and any provider or facility that still needs
matching to a QuickBooks Time user or jobcode, which is picked right there and remembered.
**Send as drafts** then makes QuickBooks Time match the week. New events arrive as drafts, so
nobody is notified until they're published in QuickBooks Time. Refusals from QuickBooks Time
are listed, and tried again on the next send. The rules live in the ORCA API (ORCA_Backend_API
`src/quickbooksTime`); this app only shows them (`components/schedule/QuickBooksDialog.tsx`,
`lib/schedule/quickbooks.ts`, `/api/quickbooks-time/*`).

## What providers see (publishing)

The board is a working copy. Providers see a week in the employee portal only once it has been
sent with **Send to QuickBooks Time**, and they keep seeing that version until the next send.
Under the board, a line says where the week stands: "Not sent yet", "Providers see this week as
shown (sent …)", or "3 changes since the last send aren't visible to providers yet". The send
dialog counts those portal changes too, so a change QuickBooks Time doesn't get (a PTO day, say)
can still be published. (`components/schedule/PublishStatus.tsx`, `/api/schedule/publication`.)

## Facility pages

Tabs, kept in the URL (`?tab=`) so they can be linked:
- **Overview:** location (with a Google Maps link), phone, fax, email, other details and activity.
- **Contacts:** Administrator, DON, DOR, IT / EHR and others, with direct phone and extension,
  email and notes. HIM and admins add, edit and remove them. Key roles nobody is recorded for are
  offered as one-click starting points.
- **Providers:** assigned staff, with Assign and End.
- **Scheduling** (admins): who's on the schedule there, week by week, read-only.
- **Hospital logins** (ADMIN, HIM).
- **Deleting a facility** (admins only): the Edit facility screen has **Delete facility** at the
  bottom, for duplicates and mistakes. It's permanent, and the ORCA API refuses it when the
  facility has provider assignments, schedule entries or hospital logins. The page then says
  what's attached and points to Archive, which hides a facility and keeps its history.

## ORCA AI (admins)

`/ai` is a conversation about ORCA's own data: employees, facilities, the schedule, coverage
gaps, conflicts and the operations dashboard's documentation and scribe metrics. The ORCA API
answers by calling a fixed set of read-only tools (ORCA_Backend_API `src/ai`); tables appear
under each answer, and the steps it took are listed above it. The model never sees the
database, credentials or personal contact details, and it can't change anything. A pill shows
whether a language model is connected, in demo mode (a scripted planner calling the same real
tools) or off; with it off, questions are disabled but uploads still work.

**Schedule uploads.** The paperclip (or the upload card) takes an `.xlsx` workbook of up to 4 MB:
a calendar grid (providers or facilities down the side, dates across), or a list with Date /
Provider / Facility columns. The ORCA API reads it, matches names to employees and facilities,
checks every proposed entry against the schedule's own rules, and saves a **draft**. Nothing is
scheduled yet. The answer links to the review page, `/ai/imports/[id]`:
- each sheet and how it was read (or why it was skipped);
- **Names to match**: a name the API couldn't place (or could place more than one way) is chosen
  once for every row that uses it; probable matches are preselected but saved only on **Match**;
- rows by status (Ready, Warnings, Needs review, Conflicts, Already scheduled, Skipped,
  Excluded, Added), each with its sheet and cell, the original text, why it has that status,
  what's already scheduled that day, and controls to change the provider or facility, accept an
  unclear cell as read, or exclude it;
- **Apply approved changes**: adds Ready rows (and rows with warnings only if that box is
  ticked), each re-checked as it's added. Rows still needing review stay in the draft for later.
  Providers see the new entries once the week is sent to QuickBooks Time.

Files: `components/ai/` (AiWorkspace, Blocks, ImportReview), `lib/ai/` (stream parsing, import
client), `/api/ai/*` (status, streamed chat) and `/api/schedule-imports/*` (proxies).
