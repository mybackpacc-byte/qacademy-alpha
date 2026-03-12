/** ============================================================
 * QAcademy Portal — Auth Config
 * Central config for sheet names, template IDs, URLs,
 * product constants, token TTLs, Google client ID, brand name.
 * No logic — constants only.
 * ============================================================ */



/* ========= auth_config.gs ========= */

/* ========= CONFIG ========= */
const SPREADSHEET_ID   = '1Aq0IaPOjC1Vo4bQb8aP0S0bO5EaeUx_4oYUlnJ2g2vc';
const TOKEN_TTL_HOURS  = 12; // CHANGED: 24 -> 12 hours
const RESET_TOKEN_TTL_MINUTES = 60; // reset links (1 hour)
const BUILD            = 'auth-v3-2025-11-26-device-labels-assign-helpers';

// Google Sign-In (OAuth) — Client ID from Google Auth Platform
const GOOGLE_CLIENT_ID = '117220903038-1qe508lr01t59mjabeavcl640hraigs4.apps.googleusercontent.com';  

/* ========= SHEET NAMES (AUTH) ========= */
const SH_USERS         = 'users';
const SH_TOKENS        = 'tokens';
const SH_ENR           = 'enrollments';        // legacy, no longer used in verify
const SH_RESET         = 'reset_requests';
const SH_PCMAP         = 'program_course_map'; // legacy, no longer used in verify
const SH_COURSES       = 'courses';

// Phase 1 access model
const SH_PRODUCTS      = 'products';
const SH_SUBSCRIPTIONS = 'subscriptions';

// NEW: auth events for login rate limiting
const SH_AUTH_EVENTS   = 'auth_events';


//For emailing password reset
const RESET_PAGE_URL = 'https://nursing2000a.blogspot.com/p/reset-password.html';   
const BRAND_NAME     = 'QAcademy Nurses Hub';

// Email templates (Drive)
const RESET_TEMPLATE_ID             = '1GsaDqPrRQcH4TjAZjEZO7EDCrd7MKOoI'; 
const WELCOME_ADMIN_TEMPLATE_ID     = '16703QLKUoApvJLCcPZgJKg5j4X83XuBi'; 
const WELCOME_SELF_TEMPLATE_ID      = '1w-iP3whsrelnyo6RQMDDkN_ckW7xWaeG'; 
const PRODUCT_ASSIGNED_TEMPLATE_ID  = '1JTfAyg4neFnaPOi6-ivGona4EFAnOdOv'; 
const SUBSCRIPTION_EXPIRING_TEMPLATE_ID = '10fGSW3-MJLzOTdjyNoEZA1oqC4JgseS_'; 
const TPL_TA_WELCOME                 = '1FNgbZYvyY6Ysi6VZukb8OgZO-DCTFJvP';



// Core URLs (update if your slugs/domain change)
const LOGIN_PAGE_URL = 'https://nursing2000a.blogspot.com/p/login_23.html'; 
const DASHBOARD_URL          = 'https://nursing2000a.blogspot.com/p/dashboard_23.html'; 
const SUBSCRIPTION_RENEW_URL = 'https://www.qacademynurses.com'; // Generic renewal URL (can be a Paystack page, pricing page, etc.) // To Change



// Social / community links (you can tweak these anytime)
const LICENSURE_TELEGRAM_URL = 'https://example.com/licensure-telegram'; // TODO: replace with real link // To Change
const TELEGRAM_URL           = 'https://t.me/QAcademynurseshub';
const WHATSAPP_URL           = 'https://www.whatsapp.com/channel/0029Vb6ActpBA1ewCfBmAF3O';
const TIKTOK_URL             = 'https://www.tiktok.com/@qacademynurses';
const LINKTREE_URL           = 'https://linktr.ee/QAcademyNursesHub';

// Email identity
const SUPPORT_EMAIL = 'mybackpacc@gmail.com';   // replies go here (change if needed)

// Optional: only use if this alias is VERIFIED in Gmail “Send mail as” for the script owner mailbox
const FROM_EMAIL    = ''; // e.g. 'admin@portal.qacademynurses.com' (leave blank until verified)
