// ============================================================
// email.js — Transactional email sending via Resend
// Replaces Google Drive template + Gmail sending from AppScript
// All functions fail silently — never block main flow
// Templates preserve exact HTML from QAcademy_Email_Templates/
// ============================================================

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_NAME      = 'QAcademy Nurses Hub';
const FROM_EMAIL     = 'noreply@qacademynurses.com';
const SUPPORT_EMAIL  = 'admin@qacademynurses.com';

/**
 * Core send function — all email functions call this.
 * Matches: _qaSendEmail_() in AppScript
 */
async function sendEmail(apiKey, { to, subject, html }) {
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [to],
        subject: subject,
        html:    html
      })
    });

    const result = await response.json();
    return { ok: response.ok, result };

  } catch (e) {
    // Fail silently — same behaviour as AppScript version
    return { ok: false, error: e.message };
  }
}

/**
 * Replace {{placeholders}} in HTML template string.
 * Matches: _renderEmailFromDrive_() in AppScript
 */
function render(template, data) {
  let html = template;
  for (const [key, value] of Object.entries(data)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    html = html.replace(pattern, value || '');
  }
  // Clear any remaining unfilled placeholders
  html = html.replace(/{{\s*[\w.]+\s*}}/g, '');
  return html;
}


// ============================================================
// RESET PASSWORD EMAIL
// Template: reset_password_v1.html
// ============================================================
export async function sendResetEmail(apiKey, { to, name, resetLink }) {
  const html = render(RESET_PASSWORD_TEMPLATE, {
    name:      name || 'there',
    resetLink: resetLink,
    brandName: FROM_NAME
  });

  return await sendEmail(apiKey, {
    to,
    subject: 'Reset your QAcademy password',
    html
  });
}


// ============================================================
// WELCOME EMAIL — SELF REGISTERED
// Template: welcome_self_onboarding_v1.html
// ============================================================
export async function sendWelcomeSelfEmail(apiKey, { to, name, username, loginUrl }) {
  const html = render(WELCOME_SELF_TEMPLATE, {
    name:     name || 'there',
    email:    to,
    username: username || '',
    loginUrl: loginUrl || 'https://qacademynurses.com'
  });

  return await sendEmail(apiKey, {
    to,
    subject: 'Welcome to QAcademy – You\'re all set',
    html
  });
}


// ============================================================
// WELCOME EMAIL — ADMIN CREATED
// Template: welcome_admin_create_v1.html
// ============================================================
export async function sendWelcomeAdminEmail(apiKey, { to, name, username, tempPassword, productName, loginUrl }) {
  const html = render(WELCOME_ADMIN_TEMPLATE, {
    name:        name || 'there',
    email:       to,
    username:    username || '',
    tempPassword: tempPassword || '',
    productName: productName || 'Your QAcademy access',
    loginUrl:    loginUrl || 'https://qacademynurses.com'
  });

  return await sendEmail(apiKey, {
    to,
    subject: 'Welcome to QAcademy – Your login details',
    html
  });
}


// ============================================================
// PRODUCT ASSIGNED EMAIL
// Template: product_assigned_v1.html
// ============================================================
export async function sendProductAssignedEmail(apiKey, { to, name, productName, expiresUtc, loginUrl }) {
  // Format expiry date nicely e.g. "26 August 2027"
  let expiryFormatted = '';
  try {
    expiryFormatted = new Date(expiresUtc).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch (e) {
    expiryFormatted = expiresUtc || '';
  }

  const html = render(PRODUCT_ASSIGNED_TEMPLATE, {
    name:        name || 'there',
    productName: productName || 'Your QAcademy access',
    expiresUtc:  expiryFormatted,
    loginUrl:    loginUrl || 'https://qacademynurses.com'
  });

  return await sendEmail(apiKey, {
    to,
    subject: 'Your QAcademy access has been activated',
    html
  });
}


// ============================================================
// EMAIL TEMPLATES
// Inlined from QAcademy_Email_Templates/ in the repo
// Placeholders: {{name}}, {{resetLink}}, {{brandName}} etc.
// ============================================================

const RESET_PASSWORD_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Reset your QAcademy password</title>
<style>
  body { margin:0; padding:0; font-family:Arial,sans-serif; background:#f5f7f7; }
  .container { max-width:540px; margin:0 auto; background:#ffffff; padding:24px; border-radius:10px; border:1px solid #f3e2c2; }
  .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:11px; letter-spacing:0.04em; text-transform:uppercase; background:#fff3cd; color:#92400e; margin-bottom:10px; }
  .title { font-size:20px; color:#92400e; font-weight:bold; margin-bottom:8px; }
  .subtitle { font-size:13px; color:#b45309; margin-bottom:18px; }
  .hi { font-size:15px; color:#111827; margin-bottom:12px; }
  .panel { background:#fff7e6; border-left:4px solid #f59e0b; padding:12px 14px; border-radius:6px; margin-bottom:18px; }
  .panel p { margin:6px 0; font-size:13px; color:#7c2d12; }
  .btn { display:inline-block; background:#f97316; color:#ffffff !important; text-decoration:none; padding:11px 20px; border-radius:999px; font-weight:bold; font-size:14px; margin:18px 0; text-align:center; }
  .small { font-size:12px; color:#4b5563; margin-bottom:10px; }
  .link { font-size:12px; color:#0b7a75; word-break:break-all; }
  .footer { font-size:11px; color:#6b7280; text-align:center; margin-top:24px; }
  .divider { height:1px; background:#e5ebeb; margin:24px 0 16px; }
</style>
</head>
<body>
  <div class="container">
    <div class="badge">Security notice</div>
    <div class="title">Reset your QAcademy password</div>
    <div class="subtitle">This link is time-limited and can only be used once.</div>
    <p class="hi">Hi {{name}},</p>
    <p style="font-size:14px;color:#111827;margin-bottom:14px;">
      We received a request to reset the password for your QAcademy account.
      If this was you, use the button below to choose a new password.
    </p>
    <div class="panel">
      <p><strong>Important:</strong> For your security, this reset link will expire after 1 hour and can only be used once.</p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
    </div>
    <center>
      <a class="btn" href="{{resetLink}}" target="_blank">Reset your password</a>
    </center>
    <p class="small">If the button does not work, copy and paste this link into your browser:</p>
    <p class="link"><a href="{{resetLink}}" style="color:#0b7a75;text-decoration:underline;">{{resetLink}}</a></p>
    <div class="divider"></div>
    <div class="footer">
      {{brandName}}<br/>
      Please do not share this link or your password with anyone.
    </div>
  </div>
</body>
</html>`;


const WELCOME_SELF_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Welcome to QAcademy</title>
<style>
  body { margin:0; padding:0; font-family:Arial,sans-serif; background:#f5f7f7; }
  .container { max-width:540px; margin:0 auto; background:#ffffff; padding:24px; border-radius:10px; border:1px solid #e7ecec; }
  .title { font-size:22px; color:#0b7a75; font-weight:bold; margin-bottom:10px; text-align:center; }
  .subtitle { font-size:14px; color:#859998; text-align:center; margin-bottom:18px; }
  .hi { font-size:16px; color:#0f172a; margin-bottom:12px; }
  .panel { background:#f0f7f7; border-left:4px solid #0b7a75; padding:14px 16px; border-radius:6px; margin-bottom:18px; }
  .panel p { margin:6px 0; font-size:14px; color:#0f172a; }
  .btn { display:inline-block; background:#0b7a75; color:#ffffff !important; text-decoration:none; padding:12px 18px; border-radius:6px; font-weight:bold; margin:18px 0; text-align:center; }
  .steps { font-size:14px; color:#0f172a; margin-bottom:18px; }
  .steps li { margin:6px 0; }
  .footer { font-size:12px; color:#6b7b7a; text-align:center; margin-top:24px; }
  .divider { height:1px; background:#e5ebeb; margin:24px 0; }
</style>
</head>
<body>
  <div class="container">
    <div class="title">Welcome to QAcademy Nurses Hub</div>
    <div class="subtitle">Your online prep for the NMC Ghana licensure exams</div>
    <p class="hi">Hi {{name}},</p>
    <p style="font-size:14px;color:#0f172a;margin-bottom:14px;">
      Thank you for creating your QAcademy account. You're now set up and ready to start exploring your courses and quizzes.
    </p>
    <div class="panel">
      <p><strong>Account email:</strong> {{email}}</p>
      <p><strong>Username:</strong> {{username}}</p>
      <p style="font-size:12px;color:#6b7b7a;margin-top:10px;">
        For your security, we don't send passwords by email. Use the password you chose during sign up.
      </p>
    </div>
    <center>
      <a class="btn" href="{{loginUrl}}" target="_blank">Go to Login</a>
    </center>
    <ul class="steps">
      <li>Sign in using your email and password</li>
      <li>Open <strong>My Courses</strong> to explore your quizzes</li>
      <li>Use the Quiz Builder to create your own practice sets</li>
    </ul>
    <div class="divider"></div>
    <div class="footer">
      QAcademy Nurses Hub • Empowering tomorrow's nurses<br/>
      If you did not create this account, please contact us at {{supportEmail}}.
    </div>
  </div>
</body>
</html>`;


const WELCOME_ADMIN_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Welcome to QAcademy</title>
<style>
  body { margin:0; padding:0; font-family:Arial,sans-serif; background:#f5f7f7; }
  .container { max-width:540px; margin:0 auto; background:#ffffff; padding:24px; border-radius:10px; border:1px solid #e7ecec; }
  .title { font-size:22px; color:#0b7a75; font-weight:bold; margin-bottom:10px; text-align:center; }
  .subtitle { font-size:14px; color:#859998; text-align:center; margin-bottom:18px; }
  .hi { font-size:16px; color:#0f172a; margin-bottom:12px; }
  .panel { background:#f0f7f7; border-left:4px solid #0b7a75; padding:14px 16px; border-radius:6px; margin-bottom:18px; }
  .panel p { margin:6px 0; font-size:14px; color:#0f172a; }
  .btn { display:inline-block; background:#0b7a75; color:#ffffff !important; text-decoration:none; padding:12px 18px; border-radius:6px; font-weight:bold; margin:18px 0; text-align:center; }
  .steps { font-size:14px; color:#0f172a; margin-bottom:18px; }
  .steps li { margin:6px 0; }
  .footer { font-size:12px; color:#6b7b7a; text-align:center; margin-top:24px; }
  .divider { height:1px; background:#e5ebeb; margin:24px 0; }
</style>
</head>
<body>
  <div class="container">
    <div class="title">Welcome to QAcademy Nurses Hub</div>
    <div class="subtitle">Your online prep for the NMC Ghana licensure exams</div>
    <p class="hi">Hi {{name}},</p>
    <p style="font-size:14px;color:#0f172a;margin-bottom:14px;">
      Your QAcademy account has been created successfully. Below are your login details and first steps.
    </p>
    <div class="panel">
      <p><strong>Email:</strong> {{email}}</p>
      <p><strong>Username:</strong> {{username}}</p>
      <p><strong>Temporary Password:</strong> {{tempPassword}}</p>
      <p><strong>Plan / Access:</strong> {{productName}}</p>
    </div>
    <center>
      <a class="btn" href="{{loginUrl}}" target="_blank">Go to Login</a>
    </center>
    <ul class="steps">
      <li>Sign in using your email and temporary password</li>
      <li>Change your password after your first login</li>
      <li>Open <strong>My Courses</strong> to explore your quizzes</li>
    </ul>
    <div class="divider"></div>
    <div class="footer">
      QAcademy Nurses Hub • Empowering tomorrow's nurses<br/>
      This is an automated message — please do not share your password with anyone.
    </div>
  </div>
</body>
</html>`;


const PRODUCT_ASSIGNED_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Your QAcademy access has been activated</title>
<style>
  body { margin:0; padding:0; font-family:Arial,sans-serif; background:#f5f7f7; }
  .container { max-width:540px; margin:0 auto; background:#ffffff; padding:24px; border-radius:10px; border:1px solid #e7ecec; }
  .title { font-size:22px; color:#0b7a75; font-weight:bold; margin-bottom:10px; text-align:center; }
  .subtitle { font-size:14px; color:#859998; text-align:center; margin-bottom:18px; }
  .hi { font-size:16px; color:#0f172a; margin-bottom:12px; }
  .panel { background:#f0f7f7; border-left:4px solid #0b7a75; padding:14px 16px; border-radius:6px; margin-bottom:18px; }
  .panel p { margin:6px 0; font-size:14px; color:#0f172a; }
  .btn { display:inline-block; background:#0b7a75; color:#ffffff !important; text-decoration:none; padding:12px 18px; border-radius:6px; font-weight:bold; margin:18px 0; text-align:center; }
  .footer { font-size:12px; color:#6b7b7a; text-align:center; margin-top:24px; }
  .divider { height:1px; background:#e5ebeb; margin:24px 0; }
</style>
</head>
<body>
  <div class="container">
    <div class="title">Your access has been activated</div>
    <div class="subtitle">QAcademy Nurses Hub</div>
    <p class="hi">Hi {{name}},</p>
    <p style="font-size:14px;color:#0f172a;margin-bottom:14px;">
      Great news — your QAcademy access has been activated. You can now log in and start your courses.
    </p>
    <div class="panel">
      <p><strong>Plan:</strong> {{productName}}</p>
      <p><strong>Access until:</strong> {{expiresUtc}}</p>
    </div>
    <center>
      <a class="btn" href="{{loginUrl}}" target="_blank">Go to My Courses</a>
    </center>
    <div class="divider"></div>
    <div class="footer">
      QAcademy Nurses Hub • Empowering tomorrow's nurses<br/>
      Do not share your password with anyone.
    </div>
  </div>
</body>
</html>`;
