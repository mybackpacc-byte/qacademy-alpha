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
| **Backend / API** | Cloudflare Workers | Routed under `/api/*` on same Pages domain |
| **Database** | Supabase (PostgreSQL) | qacademy-alpha project, West EU (Ireland) |
| **Auth** | Supabase Auth | Email+password. Google OAuth Phase 1. |
| **Sessions** | HttpOnly Cookies | access_token + refresh_token, never in localStorage |
| **Email** | Resend | noreply@qacademynurses.com |
| **Payments** | Paystack | Phase 2 |
| **Code** | GitHub | mybackpacc-byte/qacademy-alpha |

---

## Why HttpOnly Cookies (not localStorage)

The old AppScript system stored session tokens in localStorage — readable by JavaScript,
vulnerable to XSS attacks. The new system uses HttpOnly cookies set by the Worker.
The browser stores them invisibly. JavaScript never touches the token.

For this to work, the frontend and Worker must share the same domain. We achieve this by
routing `qacademy-alpha.pages.dev/api/*` to the Worker via Cloudflare Pages Functions.

---

## Repo Structure

```
/old                                  ← original AppScript code (read-only reference)
/app
  /workers
    /auth-worker
      index.js                        ← request router
      auth.js                         ← login, register, verify, logout
      reset.js                        ← reset/request, reset/apply
      admin.js                        ← create-user, assign-product
      db.js                           ← all Supabase queries
      email.js                        ← Resend email (keep unchanged)
      wrangler.toml
      package.json
  /pages
    /functions
      /api
        [[route]].js                  ← proxies /api/* to Worker
    login.html
    register.html
    reset-request.html
    reset-apply.html
    dashboard.html
```

---

## Supabase — 32 Tables (already created in Supabase)

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

## Old AppScript Services → New Cloudflare Workers (migration map)

| Old AppScript | New Worker | Phase |
|---|---|---|
| Portal_Authv2 | auth-worker | Phase 1 |
| Payments_App | payments-worker | Phase 2 |
| Builder_Fixed_Quizzes | quiz-worker | Phase 3 |
| Portal_Messaging | messaging-worker | Phase 4 |
| Offline_Pack | offline-worker | Phase 4 |
| Telegram Worker | telegram-worker | Phase 5 |

---

## Worker Secrets (add in Cloudflare dashboard)

| Secret | Used by |
|---|---|
| `SUPABASE_URL` | All workers |
| `SUPABASE_SERVICE_KEY` | All workers |
| `RESEND_API_KEY` | auth-worker |

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

| Endpoint | What it does | Status |
|---|---|---|
| `POST /api/login` | Email + password → set HttpOnly cookies | ⏳ |
| `POST /api/verify` | Read cookie → return profile + subscriptions | ⏳ |
| `POST /api/logout` | Clear HttpOnly cookies | ⏳ |
| `POST /api/register` | Create Supabase user + public.users row + WELCOME_TRIAL | ⏳ |
| `POST /api/reset/request` | Trigger Supabase branded reset email | ⏳ |
| `POST /api/reset/apply` | Apply new password via Supabase token | ⏳ |
| `POST /api/admin/create-user` | Admin creates a user manually | ⏳ |
| `POST /api/admin/assign-product` | Admin assigns a product/subscription | ⏳ |

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
- Worker deployed via `wrangler deploy` from `app/workers/auth-worker/`
- Always `git pull` before touching files
- Always `git push` after finishing a session
- PowerShell used for all commands (Windows machine)
- Supabase service role key used in Workers (bypasses RLS) — RLS added later
- Keep `email.js` exactly as written
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

**Phase 1 backend. Build auth-worker from scratch with HttpOnly cookie sessions.**

Build order:
1. `package.json`
2. `wrangler.toml`
3. `db.js`
4. `auth.js`
5. `reset.js`
6. `admin.js`
7. `index.js`
8. `[[route]].js` (Pages proxy)
9. Test all endpoints
10. Build frontend pages