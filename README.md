# Nirantar

Pharmacy refill and prescription verification platform for a 46-store chain in Kolkata and Howrah (IsoCode Labs take-home, problem #1).

Customers reorder monthly medicines in about a minute; a registered pharmacist verifies every item against the prescription (with an AI-drafted list beside the photo); approved orders go to the nearest store that has every item in stock; customers are reminded before they run out.

> Work in progress. See [docs/PLAN.md](docs/PLAN.md) for the plan and [docs/BRIEF.md](docs/BRIEF.md) for the original brief.

## Stack

React + Vite + TypeScript · Tailwind CSS · Node + Express + TypeScript · PostgreSQL + Prisma · Gemini (prescription reading) · Vitest

## Run locally

Requires Node 22+ and Docker.

```bash
npm install
npm run db:up                         # Postgres in Docker on port 15433
cp backend/.env.example backend/.env  # then set DATABASE_URL (see docker-compose.yml)
npm run db:migrate                    # create tables
npm run db:seed                       # demo data, including the brief's sample orders
npm run dev                           # API on :4000, web app on :5173
```

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Repository layout

| Folder | What's in it |
|---|---|
| `shared/` | Enums, the order state machine and helpers used by both apps |
| `backend/` | Express API, Prisma schema, migrations and seed data |
| `frontend/` | React app (customer, pharmacist, store and operations screens) |
| `docs/` | Brief, plan and decision log |
