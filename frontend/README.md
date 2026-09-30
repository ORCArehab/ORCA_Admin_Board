# ORCA Admin Web

Internal ORCA Rehab Admin Dashboard frontend (Next.js + TypeScript). It answers one question first:
**"How is provider documentation doing, and who needs attention?"**

It is a separate app from the Fastify backend (`../backend`) and consumes `GET /api/dashboard/providers`.

## Run locally

```bash
# terminal 1: backend (uses backend/.env; AUTH_MODE=disabled, loopback only)
cd ../backend && npm run dev

# terminal 2: frontend
cp .env.example .env.local     # optional; BACKEND_DEV_URL defaults to http://127.0.0.1:8080
npm install
npm run dev                    # http://localhost:3000
```

```bash
npm test          # unit tests (formatting, attention criteria)
npm run lint
npm run typecheck
npm run build
```

## How the frontend reaches the API (and authentication)

The browser only calls **same-origin** `/api/*`. The frontend never holds Google or service credentials.

| | How `/api/*` reaches the backend | Who authenticates |
|---|---|---|
| Local dev | `next dev` proxies `/api/*` to `BACKEND_DEV_URL` (rewrite in `next.config.ts`, dev only) | Nobody: backend runs `AUTH_MODE=disabled` on loopback |
| Production | One HTTPS load balancer: `/api/*` → backend Cloud Run, everything else → this app | **Cloud IAP** (ORCA Google Workspace) on both services; the backend verifies its own IAP JWT and admin allowlist |

The dev proxy is disabled in production builds on purpose. Proxying through Next.js would forward the frontend's IAP assertion, which has the wrong audience for the backend, and would blur the backend's auth boundary. A `401`/`403` from the API shows a "Sign-in required" state.

## Structure

```
src/
  app/
    layout.tsx                  shell: navigation + main
    page.tsx                    Overview: summary, Needs attention, provider table
    providers/page.tsx          provider table with search
    providers/[name]/page.tsx   provider detail
  components/
    Nav.tsx                     Overview / Providers live; Scribes / Facilities / ORCA AI shown as "Soon"
    ui.tsx                      PageHeader, MetricStrip, Section, SourceNote, Loading/Error states
    DataTable.tsx               generic table (reused later for scribes and facilities)
    providers/                  provider-specific pieces (summary, attention list, table, completion cell)
  lib/
    api.ts                      same-origin fetch client + ApiError
    types.ts                    API contract (fields the UI uses)
    useProviderDashboard.ts     data hook (shows last data while revalidating)
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
- No charts yet. Neutral surfaces, one accent, one caution color, light and dark themes (`globals.css` tokens).
