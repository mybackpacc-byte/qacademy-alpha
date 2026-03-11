# QAcademy Nurses Hub — Migration Workspace

**Live platform:** qacademynurses.com  
**Dev environment:** qacademy-alpha.pages.dev  
**Auth Worker:** auth-worker.mybackpacc.workers.dev  
**GitHub Repo:** qacademy-alpha  
**Database:** Alpha_db (Cloudflare D1)

---

## About This Project

QAcademy Nurses Hub is an online exam prep platform for Ghanaian nursing students preparing for NMC licensure exams. It covers 5 programs (RN, RM, RPHN, RMHN, NACNAP) across 11 courses.

This repository is the migration workspace — moving the platform from a Blogger + Google Apps Script + Google Sheets stack to a professional Cloudflare Pages + Workers + D1 stack.

**The production platform (qacademynurses.com) is untouched. All dev work is entirely separate.**

---

## Original Stack

- **Frontend:** Blogger (60+ pages)
- **Backend:** Google Apps Script (8 projects, 14+ files)
- **Database:** Google Sheets (4 databases + 11 question bank sheets)
- **Email:** Gmail via AppScript (100/day limit)
- **Payments:** Paystack
- **Code:** Scattered across Google Drive, no version control

---

## New Stack

| Layer | Old | New |
|---|---|---|
| **Frontend** | Blogger | Cloudflare Pages |
| **Backend / API** | Google Apps Script | Cloudflare Workers |
| **Database** | Google Sheets | Cloudflare D1 (SQLite) |
| **Question Banks** | Google Sheets (11 files) | Cloudflare D1 |
| **Email** | Gmail via AppScript | Resend (3,000/month free) |
| **Payments** | Paystack | Paystack (unchanged) |
| **Code** | Google Drive | GitHub (version controlled) |

### Key Decisions
- **One D1 database** (`Alpha_db`) — all tables consolidated, no more per-sheet splitting
- **JWT instead of stored tokens** — no DB read needed per request for auth verification, 12hr expiry
- **Separate Workers per domain** — auth-worker, quiz-worker, payments-worker etc.
- **Same logic, restructured** — all AppScript business logic preserved exactly, just moved to Workers
- **Resend for email** — replaces Gmail/AppScript, verified domain `qacademynurses.com`

---

## Repo Structure

```
qacademy-alpha/
├── blogger/                          ← original Blogger frontend (untouched)
├── Portal_Authv2-DEV/                ← original AppScript auth (untouched)
├── [other original AppScript files]  ← untouched reference
├── 0.QAcademy_Portal_DB/             ← CSV exports of original Sheets data
├── QAcademy_Email_Templates/         ← HTML email templates
└── app/                              ← NEW STACK (everything built here)
    ├── workers/
    │   └── auth-worker/
    │       ├── index.js              ← main router
    │       ├── jwt.js                ← JWT sign/verify
    │       ├── password.js           ← hashing, salt, user ID generation
    │       ├── db.js                 ← all D1 query helpers
    │       └── email.js              ← Resend email sending
    ├── src/
    │   ├── js/                       ← shared frontend JS (auth.js etc.)
    │   └── pages/                    ← HTML frontend pages
    ├── db/
    │   └── migrations/
    │       └── 0001_portal_db_schema.sql  ← full D1 schema
    └── wrangler.toml                 ← Cloudflare Worker config
```

---

## Database — Alpha_db

All 15 tables created and live in Cloudflare D1. Schema file: `app/db/migrations/0001_portal_db_schema.sql`

| Table | Status | Description |
|---|---|---|
| `users` | ✅ Live | Student and admin accounts |
| `programs` | ✅ Live + Seeded | RN, RM, RPHN, RMHN, NACNAP |
| `courses` | ✅ Live + Seeded | 11 courses across 5 programs |
| `program_course_map` | ✅ Live + Seeded | Maps programs to courses |
| `levels` | ✅ Live | Student year levels |
| `products` | ✅ Live | Subscription products |
| `subscriptions` | ✅ Live | User subscriptions |
| `auth_events` | ✅ Live | Login audit + rate limiting |
| `reset_requests` | ✅ Live | Password reset tokens |
| `payments` | ✅ Live | Paystack payment records |
| `quizzes` | ✅ Live | Fixed/admin quiz definitions |
| `attempts` | ✅ Live | Quiz attempt records |
| `offline_packs` | ✅ Live | Student offline packs |
| `threads` | ✅ Live | Messaging threads |
| `messages` | ✅ Live | Thread messages |
| `announcements` | ✅ Live | Platform announcements |
| `user_notice_state` | ✅ Live | Per-user seen/dismissed state |
| `config` | ✅ Live + Seeded | Platform config key/values |

---

## Worker Secrets (stored in Cloudflare — never in code)

| Secret | Purpose |
|---|---|
| `JWT_SECRET` | Signs and verifies JWTs |
| `RESEND_API_KEY` | Sends transactional emails via Resend |

---

## Email — Resend

- **Domain:** qacademynurses.com ✅ Verified
- **Sending address:** noreply@qacademynurses.com
- **Templates inlined in** `email.js`:
  - Reset password email
  - Welcome email (self-registered)
  - Welcome email (admin-created)
  - Product assigned email

---

## Build Phases

### Phase 1 — Auth & Identity ← CURRENT
### Phase 2 — Products, Subscriptions & Payments
### Phase 3 — Core Learning (quiz engine, question bank, runners, history)
### Phase 4 — Communication & Extras (messaging, announcements, offline packs)
### Phase 5 — Telegram Gating
### Phase 6 — Teacher Assess

---

## Phase 1 — Auth Worker Progress

**Base URL:** `https://auth-worker.mybackpacc.workers.dev`

| Endpoint | Status | Description |
|---|---|---|
| `POST /login` | ✅ Done + Tested | Email + password login, returns JWT |
| `POST /verify` | ✅ Done + Tested | Verifies JWT, returns user + access |
| `POST /register` | ✅ Done + Tested | Self registration, assigns WELCOME_TRIAL |
| `POST /reset/request` | ✅ Done + Tested | Sends reset email via Resend |
| `POST /reset/apply` | ✅ Done + Tested | Validates token, updates password |
| `POST /login/google` | ⏳ Pending | Google Sign-In |
| `POST /admin/create-user` | ⏳ Pending | Admin creates student account |
| `POST /admin/assign-product` | ⏳ Pending | Admin assigns subscription to user |

---

## ⏭️ NEXT SESSION — Resume Here

### Immediate next task: Admin Endpoints

Build these two endpoints in `index.js` (with supporting helpers in `db.js`):

**1. `POST /admin/create-user`**
- Requires valid JWT with `role = ADMIN`
- Body: `{ forename, surname, email, program_id, cohort?, role?, product_id? }`
- Generates temp password (`Qa-` + 8 chars)
- Creates user row with `must_change_password = true`
- Optionally assigns a product/subscription if `product_id` provided
- Sends welcome admin email via Resend with temp password
- Returns `{ ok, user_id, username, temp_password }`
- Original AppScript reference: `apiAdminCreateUser()` in `Portal_Authv2-DEV/auth_actions_admin`

**2. `POST /admin/assign-product`**
- Requires valid JWT with `role = ADMIN`
- Body: `{ user_id or email, product_id, start_utc? }`
- Looks up product, validates it exists and is active
- Computes expiry from `product.duration_days`
- Creates subscription row
- Sends product assigned email via Resend
- Returns `{ ok, subscription_id, expires_utc }`
- Original AppScript reference: `apiAssignProduct()` in `Portal_Authv2-DEV/auth_actions_admin`

### After admin endpoints:
- `POST /login/google` — Google Sign-In (Client ID: `117220903038-1qe508lr01t59mjabeavcl640hraigs4.apps.googleusercontent.com`)
- First frontend page — `app/src/pages/login.html`

### Important context for next session:
- Samuel's instruction: **always confirm plan before producing final code**
- All logic must match original AppScript exactly — same error codes, same behaviour, restructured not rewritten
- Worker deployed via `wrangler deploy` from `app/workers/auth-worker/` folder
- Always `git pull` before deploying to get latest GitHub changes locally
- Test commands use PowerShell `Invoke-WebRequest` syntax (not curl) — Windows machine
- JWT stored in `localStorage` on frontend, sent as `Authorization: Bearer TOKEN` or in request body as `token`

---

## Why We Are Migrating

The original stack was a brilliant solution built by one person with no coding background — but it has real limitations:

- **Speed** — Blogger is slow; Apps Script has 2–5 second cold starts per API call
- **Email limits** — Gmail via AppScript is hard-capped at 100 emails/day
- **Database limits** — Google Sheets slows significantly as data grows
- **Apps Script limits** — 6-minute execution timeouts, daily quotas
- **Maintenance** — code scattered across Google Drive with no version control

---

## Built With Heart

This platform was not built by a team of developers with a budget and a roadmap. It was built by one person, learning as they went, because they believed nursing students deserved better preparation tools.

The migration to a professional stack is not a rejection of that origin story — it's the next chapter of it.

> *"I had no coding knowledge. I just wanted to help nursing students prepare for their exams."*  
> — Samuel Owusu-Ansah, Creator of QAcademy Nurses Hub
