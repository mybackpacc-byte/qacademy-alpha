# QAcademy Nurses Hub — Migration Workspace

**Live platform:** qacademynurses.com
**Dev environment:** qacademy-alpha.pages.dev
**Auth Worker:** auth-worker.mybackpacc.workers.dev
**GitHub Repo:** qacademy-alpha (user: mybackpacc-byte)
**Database:** Supabase (PostgreSQL) — qacademy-alpha project, West EU (Ireland)

---

## About This Project

QAcademy Nurses Hub is an online exam prep platform for Ghanaian nursing students preparing for NMC licensure exams. It covers 5 programs (RN, RM, RPHN, RMHN, NACNAP) across 11 courses.

**The production platform (qacademynurses.com) is untouched. All dev work is entirely separate.**

---

## Current Status — Phase 1 Backend COMPLETE. Starting Frontend.

The Supabase migration is done. Auth Worker is live and tested. Next session starts Phase 1 frontend pages.

---

## Final Stack (locked)

| Layer | Tool | Notes |
|---|---|---|
| **Frontend** | Cloudflare Pages | qacademy-alpha.pages.dev |
| **Backend / API** | Cloudflare Workers | auth-worker.mybackpacc.workers.dev |
| **Database** | Supabase (PostgreSQL) | All 32 tables created and seeded |
| **Auth** | Supabase Auth | Email+password live. Google OAuth pending. |
| **File Storage** | Supabase Storage | For future use |
| **Email** | Resend | noreply@qacademynurses.com. Custom SMTP in Supabase. |
| **Payments** | Paystack | Phase 2 |
| **Code** | GitHub | qacademy-alpha repo |

---

## Worker Files (app/workers/auth-worker/)

| File | Status |
|---|---|
| `index.js` | ✅ Rewritten for Supabase |
| `db.js` | ✅ Rewritten for Supabase |
| `password.js` | ✅ Slimmed down — username helpers only |
| `email.js` | ✅ Unchanged — Resend email sending |
| `wrangler.toml` | ✅ Updated — D1 removed, Supabase secrets |
| `package.json` | ✅ Created — @supabase/supabase-js installed |
| `jwt.js` | 🗑️ Deleted — Supabase handles JWT |

---

## Cloudflare Worker Secrets (already added)

| Secret | Status |
|---|---|
| `SUPABASE_URL` | ✅ Added |
| `SUPABASE_SERVICE_KEY` | ✅ Added |
| `RESEND_API_KEY` | ✅ Added |
| `JWT_SECRET` | 🗑️ No longer needed |

---

## Supabase Auth Configuration (done)

- ✅ Email + password enabled
- ✅ Secure email change on
- ✅ Secure password change on
- ✅ Custom SMTP via Resend (smtp.resend.com, port 465)
- ✅ Sender: noreply@qacademynurses.com — QAcademy Nurses Hub
- ✅ Site URL: https://qacademy-alpha.pages.dev
- ✅ Redirect URLs: https://qacademy-alpha.pages.dev/reset-password and https://qacademy-alpha.pages.dev/**
- ✅ Reset password email template — branded QAcademy HTML
- ⏳ Google OAuth — pending (Phase 1 frontend)

---

## Database — 32 Tables (all created and seeded in Supabase)

### Main Portal (18)
users, programs, courses, program_course_map, levels, products, subscriptions,
auth_events, reset_requests, payments, quizzes, attempts, offline_packs,
threads, messages, announcements, user_notice_state, config

### Teacher Assess (9)
teachers, teacher_classes, teacher_class_members, teacher_bank_items,
teacher_quizzes, teacher_quiz_items, teacher_attempts, teacher_quiz_classes, library_courses

### Telegram (5)
telegram_groups, telegram_allowlist, telegram_audit, telegram_links, telegram_link_codes

### Seed Data (inserted)
- 5 programs: RN, RM, RPHN, RMHN, NACNAP
- 11 courses with sheet_ids
- 5 program-course mappings
- Config defaults (offline_max_questions, offline_packs_per_course)
- 11 library_courses (Teacher Assess)

---

## Phase 1 — Auth Endpoints (all tested and working)

| Endpoint | Status | Notes |
|---|---|---|
| `POST /login` | ✅ Live | Supabase signInWithPassword, returns JWT + profile |
| `POST /verify` | ✅ Live | Supabase getUser, returns profile + access |
| `POST /register` | ✅ Live | Creates Supabase Auth user + public.users profile + WELCOME_TRIAL |
| `POST /reset/request` | ✅ Live | Supabase sends branded reset email automatically |
| `POST /reset/apply` | ✅ Live | Supabase updates password via access_token |
| `POST /login/google` | ⏳ Pending | Phase 1 frontend |
| `POST /admin/create-user` | ⏳ Pending | Phase 1 backend continuation |
| `POST /admin/assign-product` | ⏳ Pending | Phase 1 backend continuation |

---

## Build Phases

### Phase 1 — Auth & Identity ← NEXT: Frontend pages
### Phase 2 — Products, Subscriptions & Payments
### Phase 3 — Core Learning (quiz engine, question bank, runners, history)
### Phase 4 — Communication & Extras (messaging, announcements, offline packs)
### Phase 5 — Telegram Gating
### Phase 6 — Teacher Assess

---

## ⏭️ NEXT SESSION — Resume Here

### Phase 1 Frontend Pages (build these next, in order)
1. **Login page** — email + password, calls POST /login
2. **Register page** — self signup form, calls POST /register
3. **Reset password request page** — calls POST /reset/request
4. **Reset password apply page** — reads access_token from URL, calls POST /reset/apply
5. **Dashboard** — basic page showing user profile + active courses (calls POST /verify)

### After frontend pages
- `POST /admin/create-user`
- `POST /admin/assign-product`
- Then move to Phase 2

---

## Standing Rules (always apply)

- Always confirm plan with Samuel before producing final code
- All logic must match original AppScript exactly — same error codes, same behaviour
- Worker deployed via `wrangler deploy` from `app/workers/auth-worker/` folder
- Always `git pull` before touching any files
- Always `git push` after finishing a session
- Test commands use PowerShell `Invoke-WebRequest -UseBasicParsing` syntax — Windows machine
- Supabase client in Workers uses service role key (bypasses RLS) — RLS policies added later
- Keep `email.js` exactly as written
- Frontend pages live in Cloudflare Pages (qacademy-alpha.pages.dev)

---

## Important References

- **Supabase Project:** qacademy-alpha, West EU (Ireland)
- **Auth Worker URL:** https://auth-worker.mybackpacc.workers.dev
- **Google Client ID:** 117220903038-1qe508lr01t59mjabeavcl640hraigs4.apps.googleusercontent.com
- **Brand:** QAcademy Nurses Hub
- **Support email:** mybackpacc@gmail.com
- **Owner:** Samuel Owusu-Ansah (no coding background — explain clearly)

---

## Built With Heart

This platform was not built by a team of developers with a budget and a roadmap.
It was built by one person, learning as they went, because they believed nursing students deserved better preparation tools.

> *"I had no coding knowledge. I just wanted to help nursing students prepare for their exams."*
> — Samuel Owusu-Ansah, Creator of QAcademy Nurses Hub