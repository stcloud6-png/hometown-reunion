# CZR BHS87 Reunion

A small group-planning site for the CZR BHS87 reunion (Jan 9–30, 2027). Classmates
mark their day-by-day availability, pick activities they're interested in, and the
group dashboard turns everyone's answers into the best windows to get together —
plus interest clusters, volunteer sign-ups, and a Yacht Club/MiEvento tracker.

Live site: https://czr-bhs87-reunion.vercel.app

## Stack

- **Client:** React + Vite, Tailwind CSS v3, shadcn/ui, [wouter](https://github.com/molefrog/wouter) (hash routing)
- **Server:** Express (serves the built client; no custom API routes — the client talks to Supabase directly)
- **Data:** Supabase (Postgres + PostgREST), Row Level Security enabled on every table
- **Language:** TypeScript throughout

## Project structure

```
client/
  src/
    lib/reunion.ts          # data model, date/schedule logic, Supabase REST client, CSV export
    lib/use-reunion-data.ts # data-fetching hook (live Supabase or demo/stub data)
    components/
      entry-form.tsx        # "My availability" form
      dashboard.tsx         # "Group dashboard" — best windows, roll call, clusters, who's in town
      ui/                   # shadcn/ui primitives
    pages/
      home.tsx              # tab shell (My availability / Group dashboard)
      lead-invite.tsx       # magic-link invite landing page for cluster organizers
    hooks/use-dark-mode.ts
server/
  index.ts                  # Express static server
```

## Local development

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

The dev server runs on port 5000 by default.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project REST URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key — safe to expose client-side; every table has RLS |
| `VITE_STUB_DATA` | `true` to use in-memory demo data instead of hitting Supabase — use this for local QA so you never write test rows to the live database |

**Never commit `.env`.** It's gitignored; only `.env.example` (with placeholder values) is tracked.

## Data model

Three tables in Supabase, all with Row Level Security:

- `people` — name, email, arrival/departure dates, per-day/per-period `slots` JSON, `interests`, `attending`, `volunteer_support`, `volunteer_lead`, `yacht_paid`, `mievento_intents`. Anonymous visitors can insert/select; updates and deletes are restricted to rows whose `email` matches the authenticated user's email claim (case-insensitively).
- `activities` — the list of things people can express interest in (a base set plus anything classmates suggest).
- `cluster_leads` / `event_plans` — volunteer organizers and the resulting event plan (venue, date, time, capacity) once an interest cluster has an organizer.

## Maintenance mode

Certain dashboard actions (editing the group's event plan for a cluster) are gated
behind a maintenance PIN, entered via the gear icon in the dashboard header.

## Contributing

`main` is protected — all changes go through a feature branch and a pull request.

## License

[GNU Affero General Public License v3.0](LICENSE).
