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
  with the **ADMIN** role get in. Roles are re-checked every 10 minutes, and the session ends if ADMIN is removed.
- **Data:** the browser calls this app's own `/api/dashboard/{providers,scribes}`. Those routes run on the server and
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
  components/
    Nav.tsx                     Overview / Providers / Scribes live; Facilities / ORCA AI shown as "Soon"
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
