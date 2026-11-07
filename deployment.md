# Nirantar: deployment and demo guide

- **Live app:** https://nirantar-zeta.vercel.app
- **Code:** https://github.com/PrashantVashisth1/Nirantar

## Try it in 5 minutes

Open the live app. The first load can take about a minute if the free server was asleep.

Under **Try the demo**, tap a person to continue as them, with no typing. Each person's screen says what they do and what to try. Sign out to switch.

1. **Debasish Ghosh (customer):** tap **Reorder** on Amlodipine 5 mg, then **Continue** → **Place order**.
2. **Sanjukta Roy (pharmacist):** in the queue, open that order. The dose comes from the last fill. Tick the confirmation → **Approve & route**. Then in **Store orders**: start picking, enter an invoice number, mark packed, hand over, mark delivered.
3. **Sudipta Roy (customer):** **Upload a prescription** → **Use a sample prescription** → **Handwritten prescription**. The AI drafts the cart. Try **Blurry photo** too.
4. **Imran Hossain (pharmacist):** open **RX-50231** (Schedule H1), approve it and hand it over; a register row is written. Or reject **RX-50230** with a reason.
5. **Priya Chatterjee (operations):** see the safety line and all orders in **Overview**, and the H1 register in **Rules**. Upload [`docs/demo/stock-valid.csv`](docs/demo/stock-valid.csv) in **Stock** and the waiting order RX-50227 gets routed. [`docs/demo/stock-with-errors.csv`](docs/demo/stock-with-errors.csv) shows how bad rows are refused.

**Reset demo** (operations) starts everything over. The demo also rebuilds itself every night at 02:00 IST, and everyone shares the same demo data.

## Demo logins

One tap is enough, but you can also use the real forms. All data is fictional.

**Customers:** enter the number on the sign-in page. In test mode the code appears on screen. A number can ask for one code every 30 seconds, and 3 codes in 15 minutes.

| Number | Person | Shows |
|---|---|---|
| 9000010001 | Debasish Ghosh | Reorder, ordering for a parent, RX-50211 (packed) |
| 9000010002 | Rina Sen | RX-50214, waiting for a pharmacist |
| 9000010003 | Arif Mondal | RX-50219, asked for a clearer photo |
| 9000010004 | Sudipta Roy | AI upload, RX-50226 generic choice |
| 9000010005 | Farhana Begum | Bengali, expired prescription, RX-50227 waiting for stock |
| 9000010006 | Ankit Agarwal | New customer: onboarding and empty home |

**Staff:** tap **Staff sign-in**. The password for all of them is `Nirantar@2026`.

| Email | Person | Role |
|---|---|---|
| sanjukta.roy@demo.example | Sanjukta Roy | Pharmacist, Salt Lake |
| imran.hossain@demo.example | Imran Hossain | Pharmacist, New Town |
| moumita.das@demo.example | Moumita Das | Pharmacist, Behala |
| sourav.pal@demo.example | Sourav Pal | Pharmacist, Howrah Maidan |
| ananya.bose@demo.example | Ananya Bose | Pharmacist, Gariahat |
| rahul.dutta@demo.example | Rahul Dutta | Pharmacist, Dum Dum (stale stock count, so no orders are routed there) |
| ops@demo.example | Priya Chatterjee | Central operations |

The queue is shared by all pharmacists. **Store orders** shows only that pharmacist's store, so after approving, check which store the order was routed to.

**About the AI on the demo:** it uses Gemini's free tier, with limited reads a day. If a new upload says your pharmacist will read the prescription, the limit or an overload was hit, and the order still works by hand. Seeded orders such as RX-50214 and RX-50229 already carry AI drafts. Please use only the sample prescriptions: don't upload real medical documents.

## Run it locally

Needs Node 22+, npm and Docker Desktop.

```bash
git clone https://github.com/PrashantVashisth1/Nirantar.git
cd Nirantar
npm ci
npm run db:up          # Postgres in Docker, host port 15433
```

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

Then set these values in `backend/.env`:

- `DATABASE_URL`: `postgresql://nirantar:nirantar_local_only@localhost:15433/nirantar` (a local-only Docker password, from `docker-compose.yml`)
- `SESSION_SECRET` and `OTP_PEPPER`: run this once for each and paste the result:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```
- `PRESCRIPTION_KEY`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `GEMINI_API_KEY` (optional): a key from Google AI Studio. Without it, every prescription goes to the pharmacist's manual path.

Create the tables and demo data, then start the app in two terminals:

```bash
npm run db:generate -w backend
npm run db:deploy -w backend
npm run db:seed
```

```bash
npm run dev -w backend     # API on http://localhost:4000
```

```bash
npm run dev -w frontend    # App on http://localhost:5173
```

Open http://localhost:5173. The sign-in page shows **Try the demo**.

## Run the tests

Tests use a separate database, so they never touch the demo data. Create it once:

```bash
docker exec nirantar-db psql -U nirantar -d nirantar -c "CREATE DATABASE nirantar_test;"
```

```bash
npm run lint
npm run typecheck
npm test                         # unit and integration tests, on real Postgres
npx playwright install chromium  # once
npm run e2e                      # browser journeys, on their own ports with the AI off
npm run ai:eval                  # AI evaluation; needs GEMINI_API_KEY and uses free quota
```

## How it's deployed

| Part | Service | Configured by | Notes |
|---|---|---|---|
| Frontend | Vercel (free) | `vercel.json` | Serves the built app. `/api/*` is rewritten to the API, so the session cookie is first-party |
| API | Render (free, Singapore) | `render.yaml` Blueprint | Builds from the repository root. Migrations run during the build |
| Database | Neon (free, Singapore) | Direct connection string, without pooling | Neon has no India region |
| Daily reminders | GitHub Actions | `.github/workflows/reminders.yml` | 09:00 IST, calls a secret-protected endpoint |
| Demo refresh | GitHub Actions | `.github/workflows/demo-refresh.yml` | 02:00 IST. Run by hand to load data after the first deploy |
| Checks | GitHub Actions | `.github/workflows/ci.yml` | Lint, typecheck, tests, build and browser journeys on every push |

To deploy a copy:

1. Create a Neon project and copy its direct connection string.
2. On Render: **New → Blueprint**, choose this repository, and enter the three values it asks for.
3. On Vercel: import this repository with the root directory left as `./`. If your API URL differs, update it in `vercel.json`.
4. Set `APP_ORIGIN` on Render to the exact Vercel URL.
5. Add the GitHub secrets below, then run **Refresh demo data** from the Actions tab.

Render's free tier sleeps after 15 idle minutes, and waking takes about a minute. This demo also has an external uptime monitor calling `/api/health` every 5 minutes. That endpoint doesn't touch the database, so Neon can still scale to zero.

## Environment variables (names only)

**API (Render, or `backend/.env`)**

| Name | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Yes in production | `production` turns on the Secure cookie |
| `APP_ENV` | Yes | `development`, `test`, `demo` or `production`. Anything but `production` enables the shown OTP, one-tap sign-in, Reset demo and demo refresh. The public demo uses `demo` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `APP_ORIGIN` | Yes | Public URL of the frontend, for the cross-site request check |
| `SESSION_SECRET` | Yes | Signs the session cookie |
| `OTP_PEPPER` | Yes | Secret mixed into stored OTP hashes |
| `PRESCRIPTION_KEY` | Yes | 32-byte AES key (base64) for prescription images |
| `CRON_SECRET` | Optional | Protects the scheduled jobs; without it those endpoints are off |
| `GEMINI_API_KEY` | Optional | Without it, prescriptions go to manual entry |
| `GEMINI_MODEL` | Optional | Primary model |
| `GEMINI_FALLBACK_MODELS` | Optional | Comma-separated models tried next |
| `AI_TIMEOUT_MS` | Optional | Timeout per AI attempt |
| `PORT` | Optional | Render sets this itself |
| `LOG_LEVEL` | Optional | Log detail |
| `NODE_VERSION` | On Render | Node version to build with |

**GitHub Actions secrets:** `APP_URL` (the API's URL) and `CRON_SECRET` (the same value as on the API).

**Frontend (Vercel):** none. All settings come from the API.
