# QAcademy Nurses Hub — Migration Workspace

**Live platform:** qacademynurses.com ← untouched, never touch this
**Dev environment:** qacademy-alpha.pages.dev
**GitHub Repo:** mybackpacc-byte/qacademy-alpha

---

## About This Project

QAcademy Nurses Hub is an online exam prep platform for Ghanaian nursing students preparing for
NMC licensure exams. It covers 5 programs (RN, RM, RPHN, RMHN, NACNAP) across 11 courses.
Built by Samuel Owusu-Ansah with no coding background — just determination.

> *"I had no coding knowledge. I just wanted to help nursing students prepare for their exams."*
> — Samuel Owusu-Ansah, Creator of QAcademy Nurses Hub

---

## Target Stack (locked)

| Layer | Tool | Notes |
|---|---|---|
| **Frontend** | Cloudflare Pages | qacademy-alpha.pages.dev |
| **Backend / API** | Cloudflare Pages Functions | Lives in `/app/pages/functions` — same domain, no separate Worker |
| **Database** | Supabase (PostgreSQL) | qacademy-alpha project, West EU (Ireland) |
| **Auth** | Supabase Auth | Email+password. Google OAuth Phase 2. |
| **Sessions** | HttpOnly Cookies | access_token + refresh_token, never in localStorage |
| **Email** | Resend | noreply@qacademynurses.com |
| **Payments** | Paystack | Phase 2 |
| **Code** | GitHub | mybackpacc-byte/qacademy-alpha |

---

## Why Pages Functions (not a separate Worker)

Everything lives in one repo and deploys together via Cloudflare Pages.
No separate Worker to manage. No proxy layer needed.
Frontend and API share the same domain automatically — which is required for HttpOnly cookies to work.

When a student visits `qacademy-alpha.pages.dev/api/login`, Cloudflare Pages routes it directly
to `app/pages/functions/api/login.js`. Clean and simple.

---

## Why HttpOnly Cookies (not localStorage)

The old AppScript system stored session tokens in localStorage — readable by JavaScript,
vulnerable to XSS attacks. The new system uses HttpOnly cookies set by the Functions.
The browser stores them invisibly. JavaScript never touches the token.

---

## Repo Structure

```
/old                                         ← original AppScript code (read-only reference)
  /Appscripts/
  /blogger/
  /Sheets/
  /Email templates/
  ... (everything currently in repo root moves here)

/app
  /pages
    /functions
      /api
        login.js                             ← POST /api/login
        verify.js                            ← POST /api/verify
        logout.js                            ← POST /api/logout
        register.js                          ← POST /api/register
        /reset
          request.js                         ← POST /api/reset/request
          apply.js                           ← POST /api/reset/apply
        /admin
          create-user.js                     ← POST /api/admin/create-user
          assign-product.js                  ← POST /api/admin/assign-product
    /shared
      db.js                                  ← all Supabase queries
      email.js                               ← Resend email sending
      cookies.js                             ← cookie helpers
    login.html
    register.html
    reset-request.html
    reset-apply.html
    dashboard.html
```

---

## Cloudflare Pages — Environment Variables (Secrets)

Set these in Cloudflare Dashboard → Pages → qacademy-alpha → Settings → Environment Variables:

| Secret | Used by |
|---|---|
| `SUPABASE_URL` | All functions |
| `SUPABASE_SERVICE_KEY` | All functions |
| `RESEND_API_KEY` | login, register functions |

---

## Supabase — 32 Tables (already created)

### Main Portal (18)
users, programs, courses, program_course_map, levels, products, subscriptions,
auth_events, reset_requests, payments, quizzes, attempts, offline_packs,
threads, messages, announcements, user_notice_state, config

### Teacher Assess (9)
teachers, teacher_classes, teacher_class_members, teacher_bank_items,
teacher_quizzes, teacher_quiz_items, teacher_attempts, teacher_quiz_classes, library_courses

### Telegram (5)
telegram_groups, telegram_allowlist, telegram_audit, telegram_links, telegram_link_codes

---

## Old AppScript Services → New Pages Functions (migration map)

| Old AppScript | New Location | Phase |
|---|---|---|
| Portal_Authv2 | `app/pages/functions/api/` | Phase 1 |
| Payments_App | `app/pages/functions/api/payments/` | Phase 2 |
| Builder_Fixed_Quizzes | `app/pages/functions/api/quiz/` | Phase 3 |
| Portal_Messaging | `app/pages/functions/api/messaging/` | Phase 4 |
| Offline_Pack | `app/pages/functions/api/offline/` | Phase 4 |
| Telegram Worker | `app/pages/functions/api/telegram/` | Phase 5 |

---

## Build Phases

### Phase 1 — Auth & Identity ← WE ARE HERE
### Phase 2 — Products, Subscriptions & Payments
### Phase 3 — Core Learning (quiz engine, attempts, history)
### Phase 4 — Communication & Extras (messaging, announcements, offline packs)
### Phase 5 — Telegram Gating
### Phase 6 — Teacher Assess

---

## Phase 1 — Backend Endpoints

| Endpoint | File | Status |
|---|---|---|
| `POST /api/login` | `functions/api/login.js` | ⏳ |
| `POST /api/verify` | `functions/api/verify.js` | ⏳ |
| `POST /api/logout` | `functions/api/logout.js` | ⏳ |
| `POST /api/register` | `functions/api/register.js` | ⏳ |
| `POST /api/reset/request` | `functions/api/reset/request.js` | ⏳ |
| `POST /api/reset/apply` | `functions/api/reset/apply.js` | ⏳ |
| `POST /api/admin/create-user` | `functions/api/admin/create-user.js` | ⏳ |
| `POST /api/admin/assign-product` | `functions/api/admin/assign-product.js` | ⏳ |

---

## Phase 1 — Frontend Pages

| Page | Calls | Status |
|---|---|---|
| login.html | POST /api/login | ⏳ |
| register.html | POST /api/register | ⏳ |
| reset-request.html | POST /api/reset/request | ⏳ |
| reset-apply.html | POST /api/reset/apply | ⏳ |
| dashboard.html | POST /api/verify | ⏳ |

---

## Standing Rules (always apply)

- **Always confirm plan with Samuel before writing final code**
- All logic must match original AppScript behaviour — same error codes, same data shapes
- Deployed automatically via GitHub push → Cloudflare Pages CI/CD
- Always `git pull` before touching files
- Always `git push` after finishing a session
- PowerShell used for all commands (Windows machine)
- Supabase service role key used in Functions (bypasses RLS) — RLS added later
- Keep `email.js` logic unchanged from original
- Samuel has no coding background — always explain steps in plain English

---

## Important References

- **Supabase Project:** qacademy-alpha, West EU (Ireland)
- **Google Client ID:** 117220903038-1qe508lr01t59mjabeavcl640hraigs4.apps.googleusercontent.com
- **Brand:** QAcademy Nurses Hub
- **Support email:** mybackpacc@gmail.com
- **Owner:** Samuel Owusu-Ansah

---

## ⏭️ NEXT SESSION — Resume Here

**Phase 1 backend. Build Pages Functions from scratch with HttpOnly cookie sessions.**

Build order:
1. `app/pages/shared/cookies.js`
2. `app/pages/shared/db.js`
3. `app/pages/shared/email.js`
4. `app/pages/functions/api/login.js`
5. `app/pages/functions/api/verify.js`
6. `app/pages/functions/api/logout.js`
7. `app/pages/functions/api/register.js`
8. `app/pages/functions/api/reset/request.js`
9. `app/pages/functions/api/reset/apply.js`
10. `app/pages/functions/api/admin/create-user.js`
11. `app/pages/functions/api/admin/assign-product.js`
12. Test all endpoints
13. Build frontend pages
