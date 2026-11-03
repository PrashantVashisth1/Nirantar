# Decision log

Short notes on decisions made while building, with the reason. These feed the TDD.

## Day 1 · Tue 3 Nov 2026

**npm workspaces: `shared`, `backend`, `frontend` in one repository.**
One clone, one install, one CI run. `shared` holds the enums and the order state machine so the frontend and backend can't drift apart. It is consumed as TypeScript source (Vite and esbuild compile it), so there's no separate build step for it.

**Order lifecycle as one transition table (`shared/src/order-state-machine.ts`).**
Every status change is checked against a single table of "from → to → who may do it". Unit tests prove you can't skip verification or jump fulfilment steps. The database adds its own dispatch gate on Day 2.

**Prisma 7 with the `pg` driver adapter; snake_case tables and columns.**
Prisma gives a readable schema and typed queries. Tables are mapped to snake_case so the hand-written SQL triggers (Day 2) stay readable. The Prisma CLI is pinned to 7.10.1 to match the client (npm offered an 8.0 release candidate, which we didn't take).

**Money as integer paise.**
Avoids floating-point rounding in totals. A test caught that `₹120.50` was being shown as `₹120.5`; fixed.

**Approval stored as fields on the order item.**
`approved_by`, `approved_product_id`, `approved_quantity`, `approved_prescription_id` (and `approved_generic_product_id` for a pharmacist-offered generic). The dispatch gate will compare these with the current values, so an edit after approval can't slip through.

**Schedule X / NDPS are not in the configurable rules table.**
`schedule_rules` holds only OTC, H and H1. The online ban on X and narcotics is fixed in code and (Day 2) in the database, so no configuration change can switch it off.

**Seed data is relative to "now" and refuses to run when `APP_ENV=production`.**
Wait times and reminder dates always look current after a reset; the guard stops anyone wiping a real database by accident.

**Backend bundled with esbuild.**
Lets us use extension-less imports and the shared TypeScript package without a separate compile step; npm dependencies stay external.

**Request logs contain only id, method, URL and status.**
Headers and bodies can contain cookies, phone numbers or health data, so they're never logged.

**Local Postgres on port 5433.**
Avoids clashing with any Postgres already installed on the default port.

**Removed files that `prisma init` added for AI coding assistants** (`.agents`, `.claude`, `.windsurf`, `skills-lock.json`). Not part of the product.
