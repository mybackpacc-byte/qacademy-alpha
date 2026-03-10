# qacademy-alpha
This repo will be used to migrate project alpha from sheets,appscript and blogger to cloudflarre and github repo

# QAcademy Nurses Hub — Platform Migration (Alpha)

## The Story Behind This Project

QAcademy Nurses Hub was built by **Samuel Owusu-Ansah**, an educator with no formal coding background, driven by a single goal: **help nursing students in Ghana prepare for their licensure exams**.

The idea started as a question — *how can I build an affordable, accessible assessment platform for nursing students, similar to what UWorld does for medical students?* After exploring the options, the answer was surprisingly creative: **Google Sheets as a database, Google Apps Script as a backend, and Blogger as a frontend**. Zero infrastructure cost. Zero prior coding experience. Just determination and curiosity.

Over **6 months of self-taught development**, QAcademy grew from a simple quiz idea into a full-featured learning management system — built entirely through exploration, trial and error, and sheer persistence.

---

## What QAcademy Is

QAcademy is a **multi-program nursing exam preparation platform** serving students across Ghana preparing for licensure in:

- **RN** — Registered Nursing
- **RM** — Registered Midwifery
- **RPHN** — Registered Public Health Nursing
- **RMHN** — Registered Mental Health Nursing
- **NACNAP** — Nursing Assistant / Clinical & Preventive

---

## What Was Built (Original Stack)

Despite being built by a non-coder on free infrastructure, the platform includes:

- **Authentication system** — username/email login, Google Sign-In, password reset, rate limiting, session tokens
- **Subscription & payments** — Paystack integration (mobile money), free and paid tiers, expiry reminders
- **Quiz engine** — timed and instant modes, fixed quizzes, custom quiz builder, offline packs
- **11 question banks** — one per course, thousands of questions
- **Learning history** — full attempt tracking with per-question answer recording
- **Messaging system** — threaded student-admin conversations
- **Announcements** — scoped by program, course, cohort, subscription level
- **Admin panel** — user creation, subscription management, audit logs
- **Multi-program support** — 5 nursing programs, 11 courses, all on one platform
- **Clone-friendly architecture** — designed to be duplicated across nursing sites with minimal config changes

**Original Stack:**
- Frontend: Blogger (60+ pages)
- Backend: Google Apps Script (6 projects, 3–6 files each)
- Database: Google Sheets (6 main sheets, 11 external question bank sheets)
- Payments: Paystack

---

## Why We Are Migrating

The original stack was a brilliant solution given the constraints — but it has real limitations that affect students:

- **Speed** — Blogger is slow to load; Apps Script has cold start delays of 2–5 seconds per API call
- **Design limitations** — Blogger's theme system fights every customisation attempt
- **Database performance** — Google Sheets slows down significantly as data grows
- **Apps Script limits** — 6-minute execution timeouts, daily quota limits
- **Maintenance complexity** — code scattered across Google Drive, Blogger, and Sheets with no version control

---

## New Stack

| Layer | Old | New |
|---|---|---|
| **Frontend** | Blogger | Cloudflare Pages |
| **Backend / API** | Google Apps Script | Cloudflare Workers |
| **Database** | Google Sheets | Supabase (PostgreSQL) |
| **Question Banks** | Google Sheets (11 files) | Supabase (PostgreSQL) |
| **Payments** | Paystack | Paystack (unchanged) |
| **Code & Version Control** | Google Drive | GitHub |

### Why This Stack

- **Cloudflare Pages** — serves the frontend from edge locations worldwide, near-instant load times for students
- **Cloudflare Workers** — serverless API, no timeouts, no cold starts, scales automatically
- **Supabase** — real PostgreSQL database with a visual dashboard (similar to Sheets) so the platform can be managed without writing SQL; supports CSV import for easy data migration
- **GitHub** — single source of truth for all code, enabling version control and AI-assisted development

---

## Database Schema (Migrating From Sheets)

| Table | Description |
|---|---|
| `users` | Student and admin accounts |
| `tokens` | Auth session tokens |
| `subscriptions` | User product subscriptions |
| `products` | Subscription products (free & paid tiers) |
| `courses` | 11 courses across 5 programs |
| `program_course_map` | Maps programs to their core courses |
| `attempts` | Quiz attempt records with full answer JSON |
| `offline_packs` | Student-saved question packs |
| `messages` | Student-admin messaging threads |
| `announcements` | Scoped platform announcements |
| `auth_events` | Login audit log for rate limiting |
| `reset_requests` | Password reset flow tracking |
| `payments` | Paystack payment records |

---

## Migration Plan (High Level)

1. **Database first** — Import all Sheets CSVs into Supabase, define proper SQL schema and relationships
2. **Backend second** — Rewrite all AppScript projects as Cloudflare Workers (TypeScript), preserving all existing API actions
3. **Frontend last** — Migrate all 60+ Blogger pages to clean HTML/CSS/JS on Cloudflare Pages, identify repeated page templates and build components
4. **Testing** — Run old and new stacks in parallel, verify all flows before cutover
5. **Cutover** — Switch DNS, decommission Blogger/AppScript

---

## About This Repo

This repository is the migration workspace. It contains:

- `/0.QAcademy_Portal_DB` — CSV exports of all current Sheets (database schema reference)
- `/Portal_Authv2-DEV` — AppScript source files (auth system)
- `/blogger` — Blogger page HTML sources (frontend)
- Additional AppScript projects and frontend pages to be added

**AI-assisted migration** — This migration is being planned and executed with the help of Claude (Anthropic), which reads all files in this repository via Project Knowledge to provide accurate, context-aware migration guidance.

---

## Built With Heart

This platform was not built by a team of developers with a budget and a roadmap. It was built by one person, learning as they went, because they believed nursing students deserved better preparation tools. 

The migration to a professional stack is not a rejection of that origin story — it's the next chapter of it.

> *"I had no coding knowledge. I just wanted to help nursing students prepare for their exams."*
> — Samuel Owusu-Ansah, Creator of QAcademy Nurses Hub
