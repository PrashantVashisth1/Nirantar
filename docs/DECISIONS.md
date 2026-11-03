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

## Day 2 · Wed 4 Nov 2026

**The database enforces the hard part with two triggers and a few CHECK constraints.**
Trigger 1 refuses any Schedule X / NDPS order item. Trigger 2 (the dispatch gate) refuses PICKING or later unless every active item (OTC included) is approved by an active registered pharmacist and still matches the approved quantity, prescription and product (or the approved generic with recorded consent), plus a verified prescription; handover also needs an H1 register row per H1 item. It runs on INSERT too, so nobody can create an order that is already "packed". 21 tests attack each rule with raw SQL. The seed had to change: RX-50211 is now created as ASSIGNED and moved to PACKED, through the same gate.

**Tests use their own database (`nirantar_test`).** Running tests never wipes the demo data.

**OTP: HMAC with a server secret, not a plain hash.** A 6-digit code has only a million options, so a plain hash could be reversed from a leaked table. The code is returned to the browser only when `APP_ENV` isn't `production`; a test proves it.

**Sessions with express-session + connect-pg-simple** instead of hand-written session code; new session id on login (prevents session fixation).

**Records that belong to someone else return 404, not 403.** A customer can't even learn that another customer's order exists. Non-UUID ids also return 404.

**Customer routes guard each route, not the whole router.** The customer router is mounted at `/api`; a router-wide guard answered "please sign in" for unknown URLs instead of 404. Caught before the tests ran.

**Radix primitives directly, styled with our tokens.** This is what shadcn/ui is built on; using Radix directly means no default shadcn styling to undo.

**No bottom tab bar for customers.** The customer app has one home screen (the plan's C1–C4); account actions live in a sheet. Fewer elements, calmer screen.

**Buttons use a minimum height, not a fixed height.** The Bengali "upload a new prescription to reorder" label overflowed a fixed 56 px button in a screenshot check. Hindi and Bengali dates use the full month name ("3 নভেম্বর"), because the short forms read awkwardly.

**Refill subscriptions store `days_supply`,** so the supply bar shows a real "days left out of days supplied" instead of a guess.

## Day 3 · Thu 5 Nov 2026

**Routing: one short transaction per store, with row locks.** For each store (nearest first) we lock its stock rows for the order's products (`SELECT ... FOR UPDATE`, in product order), check every item, and reserve all or nothing. A 20-order race for the last strip gives it to exactly one order. One store per transaction means two orders can never deadlock.

**Stores with a stock count older than 48 hours are not used for routing** (Dum Dum in the demo), so an order isn't sent to a store whose numbers may be wrong.

**Stock import: preview, then all-or-nothing apply.** Any bad row blocks the apply, and nothing changes. The CSV replaces `on_hand` only; `reserved` is untouched because reserved packs are still on the shelf and already counted. Products missing from a store's file become 0 (the file is a full list, A5). The same file can't be applied twice (SHA-256). After an apply, waiting orders are re-routed automatically.

**Reminders are decided once per (subscription, cycle, offset).** A unique key makes the job safe to run twice or in parallel. After a gap only the latest due reminder is sent (older ones are recorded as skipped), and nothing is sent while an order for that medicine is in progress. Messages say "may run out around <date>, based on the dose on the prescription" and never give dosing advice.

**The daily run is a GitHub Actions schedule calling a secret-protected endpoint.** Render's free tier can sleep, so an in-process cron wouldn't be reliable. Without `CRON_SECRET` the endpoint is switched off.

**CSV upload is sent as JSON text (max 2 MB)** with its own body limit, instead of adding multipart handling just for this.

**Removed files that `prisma init` added for AI coding assistants** (`.agents`, `.claude`, `.windsurf`, `skills-lock.json`). Not part of the product.
