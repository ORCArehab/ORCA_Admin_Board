# ORCA Admin API

Backend for the ORCA Rehab Admin Dashboard. It reads allowlisted operational Google Sheets (read-only) and computes dashboard metrics from the **underlying rows**. It never uses summary/BILLER totals.

V1 provides one endpoint: `GET /api/dashboard/providers`.

## Quick start (no Google access needed)

```bash
npm install
npm test          # runs the full pipeline against fixture data
npm run dev       # http://127.0.0.1:8080 (the endpoint returns 503 until a sheet is configured)
```

---

## Connecting the real ORCA provider tracker

You need a Google Cloud project, **preferably owned by ORCA's Google Workspace organization** (see "Workspace sharing restrictions" below).

### 1. Enable the Sheets API

```bash
gcloud config set project PROJECT_ID
gcloud services enable sheets.googleapis.com
```

(The Drive API is not needed until the AI/RAG work starts.)

### 2. Create a dedicated service account, with no key

```bash
gcloud iam service-accounts create orca-dashboard-reader \
  --display-name="ORCA dashboard (read-only Sheets)"
```

- Grant it **no project IAM roles**. It needs none to read a spreadsheet that has been shared with it.
- Do **not** create a JSON key unless you truly have to. Cloud Run uses the attached service account directly, and local development uses impersonation (step 4).

### 3. Give the service account read access

Share **ORCA-NP/Scribe Tracker 2026** with
`orca-dashboard-reader@PROJECT_ID.iam.gserviceaccount.com` as **Viewer** (untick "Notify people").

ORCA has also made the service account a **Viewer of the ORCA Shared Drive**, on purpose, for the future AI/RAG assistant. That is the *outer* permission boundary only. The application still reads only what it is explicitly configured to read (see "Google Workspace access and the RAG boundary"). The provider dashboard reads only the one configured spreadsheet, and the Sheets client refuses any other spreadsheet ID.

**Workspace sharing restrictions:** if ORCA's Workspace blocks sharing outside the organization, sharing with a service account from a personal/outside project will fail. Create the project under ORCA's Google Cloud organization, or ask the Workspace admin to allow it.

### 4. Local credentials by impersonation (no key file)

Grant your own Google account permission to impersonate the service account:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  orca-dashboard-reader@PROJECT_ID.iam.gserviceaccount.com \
  --member="user:YOU@example.com" --role="roles/iam.serviceAccountTokenCreator"

gcloud auth application-default login \
  --impersonate-service-account=orca-dashboard-reader@PROJECT_ID.iam.gserviceaccount.com
```

The app picks these credentials up automatically through Application Default Credentials.

### 5. Configure the environment

```bash
cp .env.example .env
```

Set `PROVIDER_TRACKER_SPREADSHEET_ID`: the `<ID>` in `https://docs.google.com/spreadsheets/d/<ID>/edit`.
Optionally set `ORCA_SHARED_DRIVE_ID`; `npm run check:drive` prints it.
Also confirm `DASHBOARD_TIMEZONE` with ORCA; it decides what counts as "today" when calculating outstanding age.

### 6. Discover the real tab structure

```bash
npm run discover
```

This prints **structure only**: tab names and gids, detected header rows, the column mapping, value types, distinct checkbox values, and any structural issues. It never prints row contents, facilities or remarks. It ends with a starter config.

Use the output to create `config/provider-tracker.json` (gitignored; see `config/provider-tracker.example.json`):

- **`providers`**: map each provider tab to the provider's canonical name. Prefer `"gid:<id>"` keys, which survive tab renames; exact tab titles also work. Shorthand tabs (e.g. `"JD"`) get their real names here. Every mapped tab is treated as *expected*: if it vanishes or loses a required column, the API reports a structural error and marks that provider `"incomplete"`.
- **`excludeTabs`**: tabs that must never be treated as provider tabs (summary/BILLER, TEMPLATE, daily trackers).
- **`unmappedTabs`**: `"include"` (default) shows provider-shaped tabs that aren't in `providers` under their tab title, flagged `UNMAPPED_TAB`; `"ignore"` drops them.

Inclusion is decided **only** by this config. Whether a tab is hidden in Google Sheets is shown in `meta.tabs[].hidden` but has no effect: hidden tabs with legitimate work are included by mapping them, and unwanted visible tabs are excluded by listing them.

Canonical names are whatever the config says. Don't invent fuller names; where the sheet only gives a first name, use that. Tabs shared by two providers keep one combined entry (e.g. `"A / B (shared tab)"`), because their totals can't be attributed to either provider.
- **`columnAliases`**: extra header spellings if a tab uses different column names, e.g. `{ "uploadedNotes": ["NOTES IN EMR"] }`.

Rerun `npm run discover` until every provider tab shows `status: provider` with the right name and there are no unexpected structural issues.

Free text in status columns appears only as normalized patterns (see "Free-text statuses" below), never verbatim.

### 7. Run it

```bash
npm run dev
curl -s http://127.0.0.1:8080/api/dashboard/providers | jq
```

---

## Deploying to Cloud Run (not public)

```bash
gcloud run deploy orca-admin-api \
  --source . \
  --region REGION \
  --service-account orca-dashboard-reader@PROJECT_ID.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars NODE_ENV=production,AUTH_MODE=iap,DASHBOARD_TIMEZONE=America/Los_Angeles \
  --set-env-vars PROVIDER_TRACKER_SPREADSHEET_ID=...,ADMIN_ALLOWED_DOMAINS=orca-domain.com,IAP_AUDIENCE=... \
  --set-secrets PROVIDER_TRACKER_CONFIG_JSON=provider-tracker-config:latest
```

- Put `config/provider-tracker.json` in Secret Manager (`provider-tracker-config`) instead of baking it into the image. The Dockerfile excludes it.
- **Authentication:** put Cloud IAP in front of the service. Use IAP directly on Cloud Run, or an external HTTPS load balancer with `--ingress internal-and-cloud-load-balancing`. Restrict IAP access to ORCA admin accounts/groups. The API then also:
  - verifies IAP's signed JWT (`x-goog-iap-jwt-assertion`) against `IAP_AUDIENCE`, and
  - checks the account against `ADMIN_ALLOWED_DOMAINS` / `ADMIN_ALLOWED_EMAILS`.

  `IAP_AUDIENCE` is `/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME` for IAP directly on Cloud Run, or `/projects/PROJECT_NUMBER/global/backendServices/BACKEND_SERVICE_ID` behind a load balancer.
- The server won't start with `NODE_ENV=production` and `AUTH_MODE=disabled`.

---

## Architecture

```
src/
  config/            env validation; source allowlist; provider-tracker config schema
  integrations/google/
    auth.ts          the ONLY place Google credentials are obtained (ADC, read-only scope)
    sheets.ts        thin reader: tab metadata + raw values; enforces the spreadsheet allowlist
    drive.ts         (future RAG) metadata-only, Shared-Drive-aware Drive reader; no content access
  sources/providerTracker/
    columns.ts       header aliases → fields; header-row detection
    discoverTabs.ts  classify tabs by header structure + config (never by position)
    parseRows.ts     raw cells → typed ProviderRow + data-quality issues
    statusText.ts    privacy-safe normalization of free text (never returned verbatim)
    index.ts         readProviderTracker(snapshot, config, today)
  metrics/provider/
    completionModel.ts        how UPLOADED NOTES maps to completed/outstanding
    backlogRules.ts           billing-sheet / facesheet backlog definitions
    computeProviderMetrics.ts pure aggregation
  services/providerDashboard.ts  fetch → parse → compute, with a TTL cache
  auth/authenticator.ts          admin auth (IAP / disabled), separate from data access
  routes/dashboard/providers.ts  GET /api/dashboard/providers
  app.ts / server.ts             app factory (injected deps) / composition root
scripts/discover-provider-tabs.ts   structure-only tracker discovery
scripts/check-drive-access.ts       Shared Drive connectivity check (counts by type; no names/contents)
```

Pipeline: Google Sheets → discover provider tabs → normalize columns → parse typed rows → flag data-quality issues → compute metrics → service → route.

Everything from `sources/` through `metrics/` is pure and tested against `test/fixtures/`.

**Adding later endpoints** (`/scribes`, `/trends`, `/facilities`, `/audit`, `/api/ai/chat`): add a source key in `config/sources.ts`, a parser under `sources/<name>/`, pure metrics under `metrics/<name>/`, a service, and a route registered inside the authenticated `/api` scope in `app.ts`. None of the provider code needs to change.

---

## Google Workspace access and the RAG boundary

Decision (2026-09-30): the service account has read-only (Viewer) access to the ORCA Shared Drive. That access does **not** mean the application may ingest, index, retrieve or expose every file.

```
Google Workspace permissions      service account = Viewer on the ORCA Shared Drive   ← outer security boundary
  → application RAG allowlist     explicit drives / folders / files approved for AI   ← narrower retrieval boundary
    → retrieval / indexing        only allowlisted items
      → OpenAI API                grounded answers from retrieved context
```

- **The Google permission is the outer boundary; the application allowlist is the retrieval boundary.** Nothing is indexed or sent to OpenAI unless it is on the allowlist.
- **Always excluded** unless a specific authorized use case says otherwise: credentials/password files, unrelated HR/legal material, infrastructure secrets, and patient/clinical documents. PHI access must be deliberate and scoped.
- **Structured data stays separate.** Dashboard metrics come from specific configured spreadsheets through the Sheets API (`config/sources.ts`), not from Drive search.
- **Shared Drives are first-class.** `integrations/google/drive.ts` always passes `supportsAllDrives` / `includeItemsFromAllDrives` and lists inside an explicit `driveId` (`corpora=drive`), optionally within a folder. It doesn't assume My Drive and has no "crawl everything" helper. Discovery for RAG will walk only allowlisted folders.
- **Scopes:** Sheets uses `spreadsheets.readonly`. Drive uses `drive.readonly`, the narrowest scope that can enumerate Shared Drives (`drives.list` rejects `drive.metadata.readonly`). No code downloads file contents yet.
- **Not built yet:** the RAG allowlist, indexing, retrieval and `/api/ai/chat`.

`npm run check:drive` confirms Shared Drive → service account → Drive API connectivity. It prints drive names/IDs and item counts by type only, never file names or contents, and stops at a safety cap.

## Provider metrics (V1)

| Field | Definition |
|---|---|
| `expectedNotes` | SUM(TOTAL) |
| `completedNotes` | SUM(TOTAL) where UPLOADED NOTES = TRUE |
| `outstandingNotes` | SUM(TOTAL) where UPLOADED NOTES = FALSE and TOTAL > 0 |
| `unknownStatusNotes` | SUM(TOTAL) where UPLOADED NOTES is blank or unrecognized (flagged) |
| `completionRate` | completed ÷ expected × 100 (1 decimal); `null` when expected = 0 |
| `outstandingBatches` | number of outstanding rows |
| `oldestOutstandingDays` / `oldestOutstandingVisitDate` | today − oldest VISIT DATE among outstanding rows; unreadable dates are excluded |
| `consults` / `followUps` | SUM(CONSULT NOTES) / SUM(PROGRESS NOTES) |
| `billingSheetBacklog` | **rows** where TOTAL > 0 and Billing sheet = FALSE |
| `facesheetBacklog` | **rows** where TOTAL > 0, a facesheet is expected, and Face sheet = FALSE |
| `dataStatus` | `"incomplete"` if a structural error means some of this provider's notes couldn't be read |
| `warningCount` | row-level warnings for this provider |

`meta.completionBasis` is `"row-level-upload-flag"`: UPLOADED NOTES is treated as a per-row/batch checkbox. That interpretation lives only in `metrics/provider/completionModel.ts`. Backlog rules live only in `metrics/provider/backlogRules.ts` and are described in `meta.backlogBasis`.

Providers are sorted by outstanding notes, then oldest outstanding age.

Response shape:

```json
{
  "meta": { "asOfDate": "2026-09-29", "timezone": "...", "completionBasis": "row-level-upload-flag",
            "backlogBasis": { ... }, "source": { ... }, "tabs": [ ... ], "cached": false },
  "providers": [ { "name": "...", "expectedNotes": 0, "completedNotes": 0, "...": "..." } ],
  "dataQuality": { "summary": { "TOTAL_MISMATCH": 3 }, "structuralIssues": [ ... ], "rowIssues": [ ... ] }
}
```

`?refresh=true` skips the cache (default TTL: 5 minutes).

## Data-quality issues

Questionable rows are **flagged, never repaired**. A row is left out only of the calculations it can't support.

| Code | Scope | Effect |
|---|---|---|
| `MISSING_REQUIRED_COLUMNS`, `NO_HEADER_ROW` | structure (error) | mapped tab's notes not counted; provider `incomplete` |
| `MAPPED_TAB_NOT_FOUND` | structure (error) | config refers to a tab that no longer exists |
| `POSSIBLE_PROVIDER_TAB` | structure | unmapped tab nearly matches; map or exclude it |
| `UNMAPPED_TAB` | structure (info) | provider named by tab title |
| `DUPLICATE_COLUMN` | structure | first matching column used |
| `INVALID_DATE` | row | counted, but excluded from outstanding age |
| `FUTURE_DATE` | row | informational |
| `MISSING_TOTAL`, `INVALID_NUMBER` | row | excluded from note counts |
| `TOTAL_MISMATCH` | row | TOTAL ≠ CONSULT + PROGRESS; TOTAL still used |
| `UNEXPECTED_STATUS`, `MISSING_STATUS` | row | upload status unknown → `unknownStatusNotes` |
| `STATUS_WITHOUT_DATA` | row | checked box on an otherwise empty row |
| `MISSING_DATE` | row | notes counted, but excluded from outstanding age |
| `MULTI_FACILITY` | row (info) | several facilities share one TOTAL; never split |

Blank rows, template rows (unchecked boxes only), repeated header rows and month-label rows are skipped without warnings.

REMARKS is never read. Rows with no facility and no non-zero note count (pre-filled future dates, formula TOTAL = 0, pre-placed unchecked boxes) are template filler and are skipped.

### Free-text statuses

Some UPLOADED NOTES / Billing sheet cells contain text instead of a checkbox. They are **not** classified: rows with free-text upload status count toward `unknownStatusNotes`, and free-text billing cells don't count as billing backlog. Warnings and `dataQuality.statusTextPatterns` show only a normalized pattern: workflow words (uploaded, pending, completed, for, upload, …) are kept, dates become `<date>`, numbers `<n>`, and everything else (initials, names) becomes `…`. Example: `"… <date> uploaded"`. Explicit normalization rules will be added after ORCA confirms the workflow.

## Open items

Validated against the real tracker: every provider matches an independent recomputation from raw cells, on every metric. Open questions for ORCA:

1. **Free-text upload statuses:** agree normalization rules (e.g. what "… <date> uploaded" means). Until then they stay under `unknownStatusNotes`.
2. **Facesheet rule:** the data suggests facesheets are expected only for rows with consults. Not applied until confirmed; the rule lives in `isFacesheetExpected` (`metrics/provider/backlogRules.ts`).
3. **Old unchecked batches:** some tabs have months of batches with the upload box unchecked. The dashboard reports the source faithfully; ORCA must confirm whether each is real backlog or stale tracking.
4. **Unidentified tabs:** unmapped tabs stay flagged (`UNMAPPED_TAB`) until ORCA identifies the provider.
5. **Free-text billing-sheet cells** are not counted as billing backlog.

## Security notes

- Nothing secret is in source control. `.env`, `config/provider-tracker.json` and key files are gitignored and excluded from Docker builds.
- Google access is read-only. The service account can view the ORCA Shared Drive (outer boundary), but the application reads only the configured spreadsheet(s) and will read only allowlisted Drive items for RAG (inner boundary).
- Free text from cells is never returned verbatim (see "Free-text statuses").
- Admin authentication (`src/auth`) is independent of Google data access and metric code.
