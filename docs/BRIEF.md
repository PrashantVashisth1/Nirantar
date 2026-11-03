# Assignment brief (source of truth)

Copied verbatim from the IsoCode Labs workspace (Software Engineering Intern, step 3: take-home task).
Due: 9 Nov 2026, 11:59 pm IST.

---

## Part 1: The task

### Your task
A client has sent us the brief you pick below. Build the product, end to end, with a great UI and UX.

| | |
|---|---|
| You submit | One ZIP file with two files: your Technical Design Document (TDD) and a `deployment.md` |
| Time | 7 days from when this step opens |
| Work | Alone |

Build a small part really well instead of the whole scope badly. The "CORE BUILD" paragraph in your problem statement says which slice must work end to end.

### Use AI, and use it well
AI tools are highly recommended. Use them to draft faster, test ideas, find gaps and polish your work, so that what you hand in is a more finished, specific outcome for this client and not a generic one. The judgement, the numbers and the final choices must still be yours. You will explain them in the interview.

### What to do
Pick one problem statement from the ones shown to you. Then build it.

### Must have
- The main flows in the brief work, on realistic sample data you create. No dead buttons
- Frontend, backend, a database and sign-in. Use roles if the brief has more than one kind of user
- The AI or automation part actually works, including what happens when it is wrong or unsure
- A polished UI: a consistent design, a layout that works on a phone, and loading, empty and error states
- Tests for the most important logic, and basic security: no secrets in the repository, validated inputs, access control

### How to submit
Put these two files in one .zip (up to 25 MB) and upload it.

**1. Technical Design Document (PDF or Word)**
- The GitHub URL of your project, at the top. Also add the link to the live app if you deployed it
- The architecture and why you chose it
- The data model, the main flows and how the AI part works
- UI and design decisions: the key screens and why they look the way they do
- What you cut, and what you would do next

**2. deployment.md**
- How to run it locally, step by step
- How it is deployed, and the environment variables it needs (names only, never the values)
- Demo login details for the reviewer

### Rules
- Use only the information in the problem statement. Label every assumption in your TDD
- Keep the commit history. We read it
- Do not put secrets or real personal data in the repository
- Keep the repository public until we have finished reviewing
- You can resubmit until the deadline; we review your latest version

### What great looks like
- A product a client could try today
- Clean, readable code with a clear structure
- A UI that feels designed, not default
- Honest notes about the limits
- Extra depth, well-judged features beyond the core and careful edge cases count in your favour

### Common mistakes
- A beautiful front end with nothing behind it
- Everything built, nothing working
- No sample data, so the app looks empty
- The AI part faked, or not handling mistakes
- A TDD with no GitHub URL

### How you'll be scored
| Area | Weight |
|---|---|
| Quality of work | 50% |
| Problem solving | 30% |
| Communication | 20% |

---

## Part 2: Chosen problem statement (#1)

### Client
Company A, Kolkata. Pharmacy chain with 46 stores across Kolkata and Howrah and a central warehouse. 380 staff, revenue ₹180–210 crore a year, with a large share from repeat medicines for diabetes, blood pressure and thyroid.

### Today
Customers call or WhatsApp a store with a photo of their prescription. Pharmacists check stock and reply, and staff deliver locally. Refills depend on customers remembering. Prescriptions sit on store phones, and stores cannot see each other's stock.

### The problem
Assumptions: 9,000 regular customers spend ₹2,200 a month each. Each month 20% (1,800) skip or buy elsewhere because nobody reminded them or their store was out of stock: 1,800 × ₹2,200 = ₹39.6 lakh of sales × 18% margin = ₹7.13 lakh a month, ₹85.54 lakh a year. WhatsApp orders: 600 a day × 6 minutes = 60 hours × 360 days × ₹220 = ₹47.52 lakh. Total ₹1.33 crore a year.

### Users
Customers and caregivers (mobile), store pharmacists, and central operations. The Managing Director signs the deal.

### The ask
My regular customers should reorder their monthly medicines in a minute and get them the same day from the nearest store with stock. A pharmacist must check the prescription every time, with nothing slipping through. Remind customers before they run out. I want one view of orders across all 46 stores.

### Must have
- Customer web app: OTP login, family profiles, search, prescription upload, cart, refill subscriptions, UPI and cash on delivery (test mode), order tracking
- Pharmacist verification queue: prescription beside the matched items, with approve, edit or reject with reason
- Routing to the nearest store with stock, from a daily stock CSV
- Refill reminders from quantity and dosage, with one-tap reorder
- Store order screen: pick, pack, store invoice number and handover to delivery
- Central dashboard: orders by store, verification time and rejections

### Core build
Software Engineering candidates must ship this slice end to end, in about 6 to 8 screens: reorder flow with prescription upload, pharmacist verification queue, store routing, and refill reminders. Roles: customer and pharmacist. AI: prescription reading as a draft. Hard part: blocking Schedule H items without approval. Mock payments, messages and outside systems, and seed from the sample data. The rest of MUST HAVE is optional depth.

### Out of scope
- Doctor consultations
- Lab test booking
- Integration with store billing software

### AI or automation
AI reads uploaded prescriptions, often handwritten, and suggests matching products and quantities, plus cheaper generic options. When it is wrong: AI output is only a draft in the pharmacist's queue, and a registered pharmacist approves every item; unreadable ones get a re-upload request; generic options need pharmacist approval and customer consent; the system never gives medical advice.

### Constraints
Under the Drugs and Cosmetics Act and Rules, Schedule H and H1 medicines need a valid prescription; Schedule X and narcotic items must not be sold online at all; H1 sales need a register with prescriber and patient details. Online pharmacy rules are not final, so keep rules configurable. Prescriptions are sensitive health data under the DPDP Act 2023: encrypt them and log access. Bengali, Hindi and English.

### Design
The client values good, minimal design: clean layouts, white space, a restrained palette and clear type, with nothing on screen that lacks a purpose. Design counts as much as features. Customers are often worried or ordering for a parent: the app must feel calm and trustworthy, with large text, a clear reorder button on the home screen and no promotional clutter. Pharmacists should compare the prescription and matched items side by side.

### Budget and time
₹9 lakh, 8 weeks. Success: 30% of regular customers ordering online in 6 months; monthly drop-off from 20% to 10%; median verification under 10 minutes; no Schedule H or H1 item dispatched without approval.

### Sample data

| Order ID | Customer | Item | Schedule | Qty | Price ₹ | Prescription | Store | Status |
|---|---|---|---|---|---|---|---|---|
| RX-50211 | Debasish Ghosh, for mother | Metformin 500 mg, strip of 15 | H | 4 | 120 | Approved | Salt Lake | Packed |
| RX-50214 | Rina Sen | Telmisartan 40 mg, strip of 10 | H | 3 | 285 | Pending | Behala | Awaiting pharmacist |
| RX-50219 | Arif Mondal | Levothyroxine 50 mcg, bottle of 100 | H | 1 | 190 | Re-upload asked | Howrah Maidan | On hold |
