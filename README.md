# Nirantar

Pharmacy refill and prescription verification platform for a 46-store chain in Kolkata and Howrah (IsoCode Labs take-home, problem #1).

Customers reorder monthly medicines in about a minute; a registered pharmacist verifies every item against the prescription (with an AI-drafted list beside the photo); approved orders go to the nearest store that has every item in stock; customers are reminded before they run out.

**Live app:** https://nirantar-zeta.vercel.app (tap any person under **Try the demo**; no typing needed)

- [deployment.md](deployment.md): 5-minute tour, demo logins, local setup, deployment and environment variables
- [Technical Design Document](docs/tdd/TDD.pdf): architecture, data model, flows, AI, design decisions, limits
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions as they were made, including ones testing proved wrong

## Stack

React + Vite + TypeScript · Tailwind CSS · Node + Express + TypeScript · PostgreSQL + Prisma · Gemini (prescription reading) · Vitest

## Run locally

See [deployment.md](deployment.md#run-it-locally). Needs Node 22+ and Docker.

## Repository layout

| Folder | What's in it |
|---|---|
| `shared/` | Enums, the order state machine and helpers used by both apps |
| `backend/` | Express API, Prisma schema, migrations and seed data |
| `frontend/` | React app (customer, pharmacist, store and operations screens) |
| `e2e/` | Browser journeys (Playwright) |
| `scripts/` | Sample prescription generator and TDD build |
| `docs/` | Brief, plan, decision log, TDD and AI evaluation results |
