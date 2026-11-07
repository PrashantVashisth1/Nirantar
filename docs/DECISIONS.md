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

## Days 4–5 · Fri 6 / Sat 7 Nov 2026 (done early, 4 Nov)

**Prescription photos are re-encoded, then encrypted.** The real file type is read from the bytes (a PDF renamed `.jpg` is refused). sharp fixes rotation, drops all metadata (including GPS) and resizes. AES-256-GCM uses the prescription id as associated data, so an encrypted file can't be moved to another record. Images are served only to the owner or a pharmacist, with `no-store`, and every view is logged.

**The AI only transcribes; our code matches.** Gemini returns a fixed JSON shape (validated with Zod). Catalog matching is deterministic: name similarity plus exact strength, and a different strength is never auto-selected. Dose text ("1-0-1", "BD") is turned into a pre-fill for the pharmacist, never used directly for refills. Without a `GEMINI_API_KEY` every read goes straight to the manual path, which is a complete flow.

**No job queue for AI reads.** The read runs in the background right after upload; a read still "reading" after 2 minutes is marked failed the next time anyone looks at it (one conditional update). Retry AI re-runs it.

**An order can be placed with just a photo.** If the AI can't read it, the customer can still continue; the pharmacist adds the medicines and the customer confirms the changes. Found while testing the sample prescription with the AI switched off.

**The pharmacist's decision is one atomic request.** The workspace keeps edits locally and submits everything at once: per-item approval of the exact product, quantity and prescription, removals with reasons, generic offers, and prescription details. Changes or generic offers go to the customer first; otherwise the order is routed immediately. Simpler and safer than saving each field separately.

**Generic switch = pre-approved option + recorded consent.** Offering a generic approves it; the customer's Keep/Switch choice and time are stored; the database gate accepts the generic only with that consent.

**Version numbers on orders.** Every change checks the version the screen loaded; a stale screen gets 409 and reloads instead of overwriting someone else's decision.

**Handover is the moment of sale.** H1 register rows are written and stock leaves the store (on_hand and reserved both drop) in the same transaction as the status change. UPI orders can't be handed over unpaid. Delivery starts refill tracking from the pharmacist-confirmed dose.

**Tests run against one real listening server per file.** Supertest's per-request servers occasionally closed mid-test.

## Day 6 · Sun 8 Nov 2026 (done early, 5–6 Nov)

**Seed v2 walks every order through its statuses, one step at a time.** So every seeded row passed the same database gate as a real order. One test rebuilds the whole demo world, which means a seed that broke a safety rule would fail CI. Sample photos are generated by `scripts/generate-samples.cjs` and match each order's doctor, patient and medicines.

**The safety line is measured, not assumed.** "H/H1 items dispatched without approval" is counted from the data on each load; if the gate ever failed, the number would show it.

**Reset demo doesn't exist in production.** The route answers 404 unless in test mode, and the seed itself refuses to run in production. A test proves nothing is wiped. It also signs everyone out, because the users are recreated.

**E2E runs with the AI off.** Results never depend on an outside service, and the manual path gets exercised on every run. The first run found the OTP resend wait applies to repeat sign-ins, so a returning customer reuses their session in the test.

**Customer language follows the account.** Found in the screenshot check: a Bengali account on a new phone saw English, because only that browser's saved choice was read. The account's language now wins once signed in.

**A refill offers the dose from the last fill.** Otherwise the pharmacist retypes a dose the chain already confirmed, and a 0-0-0 slip would silently stop refill tracking. It's marked "from the last fill", still has to be approved, and a prescription medicine now can't be approved without a dose (or "as needed").

**Staff screens are separate downloads.** Customers on phones don't load the pharmacist and operations code.

## Before Day 7 · 6 Nov 2026

**A feature audit against the plan's screens found four gaps, now closed.** A reminder switch per medicine, a sample picker (typed, handwritten, blurry, not a prescription) so every AI path can be shown, a "Not found on prescription" marker, and an alert for prescriptions past the 180-day policy.

**`npm run ai:eval` scores the reader on labelled synthetic samples.** It counts lines matched to the exact product, correct doses, wrong products selected, and whether a blurry or non-prescription photo ever comes back as a confident read. A test feeds a perfect transcription through the same scoring, so a lower real score points at the reader rather than our matcher.

**The first real AI call found two problems no mocked test could.** Gemini refused our output schema as too complex ("too many states"), so every read would have failed quietly into manual entry; removing `maxItems` fixed it, and Zod still enforces the limits on the answer. And `gemini-3.8-flash` was overloaded (503), while the SDK's hidden retries made it look like a timeout. So the default is now the stable `gemini-3.6-flash`, the SDK's retries are off, the one retry goes to a second model, and a refused request isn't retried. This replaces the model named in the plan (§8), which Google's docs now label "New" rather than "Stable".

**The first full eval found a real matcher bug.** Handwritten "Glimora 2" comes back with strength "2" and no unit. We ignored a number without a unit, all strengths then tied, and **Glimora 1** was selected: exactly what the plan says must never happen. The pharmacist would still have checked it, but now a bare number has to equal the product's strength, and if no strength is written and we stock several, nothing is pre-selected. The eval's "wrong product" count is what surfaced this, which is why it counts that separately from accuracy.

**Three attempts instead of two (plan §8 said one retry).** That first eval lost 5 of 16 reads to free-tier overload. A second model, then the first again after short waits, still fits the 2-minute limit, and a refused request still isn't retried.

**The free tier allows about 20 AI reads a day per model.** Measured, not assumed: Google answered "limit: 20 requests per day on Free Tier" during the eval. So a model over its limit isn't asked again, the eval can resume across days, the seeded orders carry drafts that need no AI call, and when the quota runs out new uploads take the manual path, which is complete. A real deployment would need a paid tier; this is stated in the TDD rather than hidden.

**Local Postgres moved from port 5433 to 15433.** After a reboot, Windows (Hyper-V) reserved 5414-6013 and Docker couldn't bind 5433. A port outside that range needs no admin commands.

**Testing against the real AI found two more UI bugs.** "Take the photo again" cleared the photo first, which unmounted the file input while the chooser was open, so the chosen file was silently lost; the photo now stays until a new one is chosen. And Retry AI existed on the server with no button; it's now in the workspace, the draft appears without a reload, and it only fills empty fields so nothing the pharmacist typed is overwritten.

**On a blurred photo the model invented medicines.** The fallback model returned "Tab Pyrexia 80 mg" and "Dr. R. Adam" from an unreadable image, at medium confidence, while the eval's score stayed clean because nothing matched our catalog. That's the real safety argument for matching in our own code: an invented name can't become a product unless it happens to match, and a pharmacist still reviews it. Three changes: the prompt forbids plausible guesses, a low-confidence name never selects a product, and a hard-to-read photo with no match asks the customer for a new photo.

**Checked against the brief line by line, three gaps closed.** The MD asked for "one view of orders across all 46 stores" and the dashboard only showed counts, so Overview now lists orders with store and status filters (no patient names: operations doesn't need them). Order messages and server errors were English even on Hindi and Bengali accounts; both now follow the account's language. A test phone number that could have belonged to a real person was replaced with a fictional one.

**E2E has its own database and ports.** It used to reseed the demo data and needed the dev servers stopped. Now it can run while someone is testing the app.

**The public demo refreshes itself every night (this reverses a plan cut).** The plan dropped the nightly reset to save infrastructure, but dates are relative to the seed and a stock count over 48 hours old stops a store being used for routing. A reviewer opening the demo three days later would have seen every order stuck waiting for stock. A small scheduled workflow calls a secret-protected endpoint that doesn't exist in production. It also loads the data after the first deploy, with no secrets on a developer's machine.

**Three different models, tried in order.** Testing the live site, the first read failed: the primary model was over its daily limit and the fallback happened to be overloaded at that moment. Going back to a model that's already over its limit can't help, so the third attempt now uses a third model. Each has its own free-tier limit, so this also gives reviewers more reads per day. Failure still ends in the complete manual path.

**One-tap demo sign-in, with a guide for each person.** Reviewers shouldn't have to copy numbers from a document, and they switch roles a lot. Going through OTP wasn't enough: a phone can only ask for 3 codes in 15 minutes, which is right for real users and would block a reviewer. So test mode has a separate sign-in route. The demo already shows its OTP on screen, so this exposes nothing new. The list comes from the server with no phones, emails or passwords, and outside test mode the route answers 404 and the list isn't sent; tests prove both. After signing in, each person sees what they do and what to try. The real OTP form stays on the page.

**Removed files that `prisma init` added for AI coding assistants** (`.agents`, `.claude`, `.windsurf`, `skills-lock.json`). Not part of the product.
