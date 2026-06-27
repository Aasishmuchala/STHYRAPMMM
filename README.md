# Sthyra Command Center

Internal operations cockpit for **Sthyra** — documents, finances, tasks, clients, and an AI
assistant across four divisions (Studios, Digital, Construction Management, Living Twin).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript strict**
- **Supabase** — Postgres, Auth, Storage, Row-Level Security, Vault, Edge Functions, pg_cron
- **Cypress** end-to-end tests + **Vitest** unit tests
- **react-hot-toast** · **react-icons** · **react-markdown** · **Tailwind v4** (class-based)

## Features

- Role-based access (Owner / Division-lead / Member / Accountant), enforced by Postgres RLS
- Tasks board with drag-drop, list view, epic roadmap, cycles & modules
- Finances (ledger, invoices, P&L, BOM, RA bills, **forecast**, CSV import + export)
- Clients pipeline (CRM) with stage tracking
- Documents library (notes / files / links) with signed-URL upload
- AI assistant on the KesarCloud Omega gateway (daily brief, ask-AI, spend ledger) — owner-only,
  key stored encrypted in Supabase Vault
- ⌘K command palette + global search across tasks, docs, invoices, clients
- Notifications (polling, with Realtime upgrade path)
- **Comments, time logs, watchers, labels, issue links, custom fields, estimates** per task
- **Releases, OKRs, automations, webhooks, repo links, public share pages, REST API**
- Themes + wallpapers + accent colours (8 themes, all themed via tokens)
- Audit-grade access control: 13 RLS gaps closed, account-takeover blocked, super-admin gated

See **[Jira comparison](docs/jira-vs-sthyra.md)** (if present) for parity analysis.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill from Supabase → Project Settings → API
npm run dev                        # http://localhost:3000
```

### Required environment variables (`.env.local`, never committed)

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; bootstraps users, RLS bypass |
| `OMEGA_API_KEY` | optional server override for the AI key (normally set in-app via Settings → AI Assistant) |
| `OMEGA_BASE_URL` | defaults to `https://omega.kesarcloud.in/v1` |

### Bootstrap the first super-admin

The first time you deploy, no one can sign in yet. Follow
[`docs/super-admin-bootstrap.md`](docs/super-admin-bootstrap.md) to insert a row into the
`invite_allowlist` table.

## Architecture

```text
                    ┌─────────────────────────────────────────────┐
   Browser  ──HTTP──│  Next.js 15 (App Router, RSC, server actions)│
                    └─────────────────┬───────────────────────────┘
                                          │ (per-request session cookie)
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │  Supabase (Postgres + Auth + Storage + Vault)│
                    │                                              │
                    │   RLS ── the only access boundary           │
                    │   profiles · tasks · projects · finances ·  │
                    │   comments · time_logs · webhooks · ...     │
                    └─────────────────────────────────────────────┘
```

- **Server actions** are the only mutation API. Every action is gated by `loadUserWorkspaceAccess`
  and a per-action permission check (RLS is the second line of defence).
- **RLS** is the security boundary — a bug in an action cannot leak data across divisions as long
  as RLS is enabled on the table.
- **Vitest** covers pure-function libraries (`format`, `csv`, `recurring`, `access`,
  `companyEmail`, `cost`, `client-toast`, `avatar`, `doc-types`, `appearance`).
- **Cypress** covers E2E flows: auth, RBAC, command palette, tasks, finances, AI.

## Local development

```bash
# First time
supabase start                          # local Postgres + Auth + Storage
npm install
npm run types:gen                       # regenerate lib/database.types.ts
npm run dev                             # http://localhost:3000

# Day-to-day
npm run typecheck                       # tsc --noEmit
npm run lint                            # eslint
npm test                               # Vitest (145 tests)
npm run e2e                             # Cypress headless
npm run cypress                         # Cypress interactive runner
```

## Testing

End-to-end tests live in `cypress/e2e`. Provide test logins via `cypress.env.json`
(gitignored — copy `cypress.env.example.json`) or `CYPRESS_*` env vars.

```bash
npm run dev      # in one terminal
npm run e2e      # headless Cypress run
```

### Unit tests (Vitest)

```bash
npm test          # 145 tests across 11 files; < 1s
npm run test:watch
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm test` | Vitest |
| `npm run test:watch` | Vitest in watch mode |
| `npm run cypress` | Cypress interactive runner |
| `npm run e2e` | Cypress headless |
| `npm run types:gen` | Regenerate `lib/database.types.ts` |

## Deploy / CI

`.github/workflows/ci.yml` runs on every push:

- `npm audit --audit-level=high`
- `npm run typecheck`
- `npm run lint`
- `npm test` (Vitest)
- `npm run build`
- `npm run e2e` (Cypress, gated on owner credentials)
- RBAC tests (gated on lead + member credentials)

Vercel auto-deploys on push to `main`. Production headers (CSP, HSTS,
`X-Frame-Options`) are set in `vercel.json`.

## Documentation

- [`docs/api.md`](docs/api.md) — REST API reference
- [`docs/super-admin-bootstrap.md`](docs/super-admin-bootstrap.md) — how to onboard the first owner
- `supabase/migrations/*.sql` — schema history; the latest is the source of truth for RLS

## Security posture (post-audit)

- 13 tables newly RLS-enabled; cross-division access blocked at the database level.
- `deletionApprovalSecret` no longer falls back to a public string — throws on misconfiguration.
- `addInvite` / `removeInvite` are super-admin-only.
- CSS / color injection in stage creation is blocked by a hex regex.
- AI-generated dates are validated against ISO before reaching Postgres.
- The personal-gmail backdoor in `lib/auth/companyEmail.ts` has been removed.

## License

Internal use only.
