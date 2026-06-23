# Sthyra Command Center

Internal operations cockpit for **Sthyra** — documents, finances, tasks, clients, and an AI
assistant across four divisions (Studios, Digital, Construction Management, Living Twin).

## Stack

- **Next.js 15** (App Router) + **React 19** + **Tailwind v4**
- **Supabase** — Postgres, Auth, Storage, Row-Level Security, Vault, Edge Functions, pg_cron
- **Cypress** end-to-end tests

## Features

- Role-based access (Owner / Division-lead / Member), enforced by Postgres RLS
- Tasks board, Finances (ledger, invoices, P&L, BOM, RA bills, CSV export, invoice PDF)
- Clients pipeline (CRM), Documents library, per-division hubs
- AI assistant on the KesarCloud Omega gateway (daily brief, ask-AI, spend ledger) — owner-only,
  key stored encrypted in Supabase Vault
- ⌘K command palette + global search, themes + wallpapers, notifications

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill from Supabase → Project Settings → API
npm run dev                         # http://localhost:3000
```

Environment variables (`.env.local`, never committed):

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `OMEGA_API_KEY` | *(optional)* server-side override for the AI key (normally set in-app) |

## Testing

End-to-end tests live in `cypress/e2e`. Provide test logins via `cypress.env.json`
(gitignored — copy `cypress.env.example.json`) or `CYPRESS_*` env vars.

```bash
npm run dev      # in one terminal
npm run e2e      # headless Cypress run
npm run cypress  # interactive runner
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run e2e` | Cypress (headless) |

CI (`.github/workflows/ci.yml`) runs typecheck → lint → build → Cypress on every push.
