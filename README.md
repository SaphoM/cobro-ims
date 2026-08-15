# Cobro IMS

Cobro Concrete's inventory management system. Built and maintained by X Spark.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for current phase status, what's real vs. mocked, and
the open business decisions that need a client conversation before proceeding further.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll land on `/login`. Demo credentials are shown on the page itself
(also in `src/lib/auth.ts`). There is no real backend yet: the app runs entirely on in-memory mock data
that resets on every server restart.

## Project layout

```
supabase/migrations/     Postgres schema (schema-as-code, not yet applied to any project)
src/lib/domain/          TypeScript types mirroring the schema
src/lib/data/            Repository interfaces + the mock implementation of them
src/lib/services/        Business logic (the WAC inventory engine)
src/lib/auth.ts          Mock session/auth — replaced wholesale in the Authentication phase
src/app/login/           Sign-in screen
src/app/dashboard/       Authenticated shell: KPIs, stock ledger, "record a movement" demo
docs/                    Architecture notes and the business-decision log
```
