# QAcademy Nurses Hub — Migration Workspace

**Live platform:** qacademynurses.com  
**Dev environment:** qacademy-alpha.pages.dev  
**Auth Worker:** auth-worker.mybackpacc.workers.dev  
**GitHub Repo:** qacademy-alpha (user: mybackpacc-byte)  
**Current Database:** Alpha_db (Cloudflare D1) ← BEING REPLACED WITH SUPABASE

---

## About This Project

QAcademy Nurses Hub is an online exam prep platform for Ghanaian nursing students preparing for NMC licensure exams. It covers 5 programs (RN, RM, RPHN, RMHN, NACNAP) across 11 courses.

**The production platform (qacademynurses.com) is untouched. All dev work is entirely separate.**

---

## ⚠️ CURRENT STATUS — MID SWITCH TO SUPABASE

We have made a deliberate decision to switch from Cloudflare D1 to Supabase before building any further. This decision was made after a thorough evaluation. See reasoning below.

**Nothing has been deleted yet. The switch has not started. We are starting fresh in a new chat.**

---

## Why We Are Switching from D1 to Supabase

After completing Phase 1 Auth on D1 we evaluated Supabase and decided it is the right long term foundation. Key reasons:

- **Built-in auth** — login, register, password reset, Google Sign-In all handled. No custom JWT/hashing code to maintain
- **Better security** — bcrypt password hashing, Row Level Security, SOC 2 certified, token refresh and revocation
- **File storage** — profile pictures and rationale images built in. D1 cannot store files at all
- **Visual dashboard** — manage students, subscriptions, attempts without writing SQL
- **50,000 free monthly active users** — generous free tier that scales with the platform
- **Full PostgreSQL** — more powerful than D1/SQLite, never need to migrate again
- **Realtime** — live announcements and messaging without extra infrastructure
- **Open source** — not locked in, can self-host if needed
- **Last migration** — PostgreSQL powers Instagram, Reddit, Spotify. QAcademy will never outgrow it

---

## Final Stack Decision (locked)

| Layer | Tool | Notes |
|---|---|---|
| **Frontend** | Cloudflare Pages | Unchanged |
| **Backend / API** | Cloudflare Workers | Unchanged — just talks to Supabase instead of D1 |
| **Database** | Supabase (PostgreSQL) | Replaces D1 |
| **Auth** | Supabase Auth | Replaces custom JWT/password code |
| **File Storage** | Supabase Storage | Profile pictures, rationale images, PDFs |
| **Email** | Resend | Unchanged — welcome and product assigned emails |
| **Payments** | Paystack | Unchanged |
| **Code** | GitHub | Unchanged |

---

## What Changes in the Switch

| File | Action |
|---|---|
| `db.js` | Rewritten — Supabase client instead of D1 |
| `jwt.js` | Deleted — Supabase handles JWT |
| `password.js` | Mostly deleted — Supabase handles hashing |
| `index.js` | Login, register, reset endpoints simplified massively |
| `wrangler.toml` | Remove D1 binding, add Supabase URL and key as secrets |
| `email.js` | Unchanged |
| `app/db/migrations/` | Schema recreated in Supabase dashboard |

## What Stays Exactly the Same

- Database schema — all 15 tables, same columns, same relationships
- Business logic — subscriptions, quiz engine, programs, courses
- Email templates — all four HTML templates unchanged
- Cloudflare Pages frontend
- Paystack payments
- GitHub repo structure
- All future phases — Phase 2 through 6 unaffected

---

## Worker Secrets (Cloudflare)

| Secret | Status | Notes |
|---|---|---|
| `JWT_SECRET` | Will be deleted | Supabase handles JWT |
| `RESEND_API_KEY` | Keep | Still needed for welcome and product emails |
| `SUPABASE_URL` | To be added | After Supabase project created |
| `SUPABASE_SERVICE_KEY` | To be added | After Supabase project created |

---

## Email — Resend

- **Domain:** qacademynurses.com ✅ Verified and working
- **Sending address:** noreply@qacademynurses.com
- **Reset password email** — will move to Supabase (handled automatically)
- **Welcome self email** — stays on Resend
- **Welcome admin email** — stays on Resend
- **Product assigned email** — stays on Resend

---

## Database Schema (unchanged — recreating in Supabase)

All 15 tables: users, programs, courses, program_course_map, levels, products, subscriptions, auth_events, reset_requests, payments, quizzes, attempts, offline_packs, threads, messages, announcements, user_notice_state, config

Seed data to re-insert:
- 5 programs (RN, RM, RPHN, RMHN, NACNAP)
- 11 courses
- 15 program-course mappings
- Config defaults

---

## Build Phases

### Phase 1 — Auth & Identity ← SWITCHING TO SUPABASE THEN RESUMING
### Phase 2 — Products, Subscriptions & Payments
### Phase 3 — Core Learning (quiz engine, question bank, runners, history)
### Phase 4 — Communication & Extras (messaging, announcements, offline packs)
### Phase 5 — Telegram Gating
### Phase 6 — Teacher Assess

---

## Phase 1 — Auth Endpoints Target State (after Supabase switch)

| Endpoint | Status | Notes |
|---|---|---|
| `POST /login` | 🔄 Rewrite with Supabase | Simpler — one Supabase call |
| `POST /verify` | 🔄 Rewrite with Supabase | Supabase verifies JWT |
| `POST /register` | 🔄 Rewrite with Supabase | Simpler — one Supabase call |
| `POST /reset/request` | 🔄 Rewrite with Supabase | Supabase sends email automatically |
| `POST /reset/apply` | 🔄 Rewrite with Supabase | Supabase handles token |
| `POST /login/google` | ⏳ Pending | Much easier with Supabase |
| `POST /admin/create-user` | ⏳ Pending | Next after switch |
| `POST /admin/assign-product` | ⏳ Pending | Next after switch |

---

## ⏭️ NEXT SESSION — Resume Here

### Step 1 — Create Supabase project
- Go to supabase.com and create a free account
- Create a new project — region: West EU (Ireland) to match Resend
- Get the project URL and service role key from Settings → API

### Step 2 — Recreate schema in Supabase
- Run the full schema SQL in Supabase SQL editor
- Re-insert all seed data (programs, courses, mappings, config)

### Step 3 — Configure Supabase Auth
- Enable email + password auth
- Configure password reset email template with QAcademy branding
- Set redirect URL to `https://qacademy-alpha.pages.dev/reset-password`
- Enable Google Sign-In (OAuth)

### Step 4 — Rewrite auth Worker
- Install Supabase JS client in the Worker
- Rewrite `db.js` using Supabase client
- Delete `jwt.js` and `password.js`
- Simplify `index.js` — login, register, reset, verify endpoints
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as Worker secrets

### Step 5 — Test all endpoints
- `/login` → `/verify` → `/register` → `/reset/request` → `/reset/apply`

### Step 6 — Continue Phase 1
- `POST /admin/create-user`
- `POST /admin/assign-product`
- Then frontend pages

---

## Important Notes for Next Session

- Samuel's instruction: **always confirm plan before producing final code**
- All logic must match original AppScript exactly — same error codes, same behaviour
- Worker deployed via `wrangler deploy` from `app/workers/auth-worker/` folder
- Always `git pull` before deploying
- Test commands use PowerShell `Invoke-WebRequest` syntax — Windows machine
- Supabase client in Workers uses the service role key (bypasses RLS) — RLS policies added later
- Keep `email.js` exactly as written — only update which emails go through Supabase vs Resend

---

## Original System Reference

- **Portal DB ID:** `1Aq0IaPOjC1Vo4bQb8aP0S0bO5EaeUx_4oYUlnJ2g2vc`
- **Google Client ID:** `117220903038-1qe508lr01t59mjabeavcl640hraigs4.apps.googleusercontent.com`
- **Brand:** QAcademy Nurses Hub
- **Support:** mybackpacc@gmail.com
- **Auth Worker URL (old AppScript):** `https://script.google.com/macros/s/AKfycbxaChsaqn6Or1G-SHqsXla1DdgYdWXzXLfs9GVs_7xrxDeYwjT0OhvWlYUsJtpMU8so/exec`

---

## Built With Heart

This platform was not built by a team of developers with a budget and a roadmap. It was built by one person, learning as they went, because they believed nursing students deserved better preparation tools.

> *"I had no coding knowledge. I just wanted to help nursing students prepare for their exams."*  
> — Samuel Owusu-Ansah, Creator of QAcademy Nurses Hub
