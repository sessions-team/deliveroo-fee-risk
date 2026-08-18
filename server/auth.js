// Google OAuth sign-in + allow-list gate for the Express server.
// Copied from the weekly-platform-kpi app (same VM, same conventions) with only the
// app identity changed — see that project's server/auth.js for the full design notes.
//
//   - this app has its OWN Google OAuth 2.0 client ("Sessions Deliveroo Fee Risk Analysis"
//     in sessions-core-data) — never reused from another app;
//   - access is controlled by allowed-emails.json in the project root, RE-READ ON EVERY
//     REQUEST (case-insensitive exact match, no domain fallback), gitignored — so adding a
//     user is "edit the file", no restart, and REMOVING one takes effect on their next
//     request rather than whenever their 30-day cookie happens to expire;
//   - callback path is /auth/callback at the app's public base URL
//     (http://feerisk.34.13.22.38.nip.io/auth/callback — register this exact URI on the client).
//
// Auth is ACTIVE ONLY WHEN GOOGLE_CLIENT_ID IS SET. A plain local `npm start` (no .env)
// keeps unauthenticated 127.0.0.1-only behaviour — nothing to configure locally.
//
// Env (all required once GOOGLE_CLIENT_ID is set):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  — the app's own OAuth client
//   APP_BASE_URL     — public origin, e.g. http://feerisk.34.13.22.38.nip.io
//   SESSION_SECRET   — random string signing the session cookie (30-day sessions)
// Optional: ALLOWED_EMAILS_FILE — override the allow-list path (default <root>/allowed-emails.json)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

// Attach auth to the app. Returns { enabled } so the caller can log the mode.
// MUST be called before any routes that need protecting.
function attach(app) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) return { enabled: false, canRefresh: () => true }; // local mode: unrestricted

  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const SESSION_SECRET = process.env.SESSION_SECRET;
  const missing = [
    !CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET', !BASE_URL && 'APP_BASE_URL', !SESSION_SECRET && 'SESSION_SECRET',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`FATAL: GOOGLE_CLIENT_ID is set but ${missing.join(', ')} is missing — refusing to start half-authenticated.`);
    process.exit(1);
  }
  const REDIRECT_URI = `${BASE_URL}/auth/callback`;
  const EMAILS_FILE = process.env.ALLOWED_EMAILS_FILE || path.join(ROOT, 'allowed-emails.json');

  // Re-read the allow-list on every call (sign-in or refresh attempt) — never cached.
  // Two shapes are accepted:
  //   ["a@x", ...]                          → everyone listed may view AND refresh/upload
  //   { "emails": [...], "refresh": [...] } → emails = who may sign in (view/download);
  //     refresh = who may trigger a rebuild or upload inputs. Absent/empty → everyone in emails may.
  function readAcl() {
    const raw = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf8'));
    const norm = a => new Set((a || []).map(e => String(e).trim().toLowerCase()).filter(Boolean));
    if (Array.isArray(raw)) return { emails: norm(raw), refresh: null };
    return { emails: norm(raw.emails), refresh: Array.isArray(raw.refresh) && raw.refresh.length ? norm(raw.refresh) : null };
  }
  // Fail loudly at startup if the allow-list is absent/malformed rather than at first login.
  try { readAcl(); } catch (e) {
    console.error(`FATAL: cannot read allow-list ${EMAILS_FILE}: ${e.message}`);
    console.error('  Create it from allowed-emails.example.json (it is gitignored — VM-only).');
    process.exit(1);
  }

  const cookieSession = require('cookie-session');
  app.set('trust proxy', 1); // running behind Caddy
  app.use(cookieSession({
    name: 'feerisk_session',
    keys: [SESSION_SECRET],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // nip.io is plain http (matches the other VM apps)
  }));

  // ---- routes ----
  app.get('/auth/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    req.session.returnTo = safePath(req.query.returnTo);
    const url = GOOGLE_AUTH + '?' + new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
      scope: 'openid email profile', state, prompt: 'select_account',
    });
    res.redirect(url);
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send(page('Sign-in failed', 'The sign-in attempt was invalid or expired. <a href="/auth/login">Try again</a>.'));
    }
    delete req.session.oauthState;

    let tok;
    try {
      const r = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
        }),
      });
      tok = await r.json();
      if (!r.ok || !tok.id_token) throw new Error(tok.error_description || tok.error || `token endpoint HTTP ${r.status}`);
    } catch (e) {
      console.error(`auth: code exchange failed: ${e.message}`);
      return res.status(502).send(page('Sign-in failed', 'Could not complete sign-in with Google. <a href="/auth/login">Try again</a>.'));
    }

    // The id_token comes straight from Google's token endpoint over TLS, so decoding its
    // payload without signature verification is safe here (standard confidential-client flow).
    const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString('utf8'));
    const email = String(claims.email || '').trim().toLowerCase();
    if (!email || claims.email_verified !== true) {
      return res.status(403).send(page('Not authorised', 'Google did not return a verified email address.'));
    }
    if (!readAcl().emails.has(email)) {
      console.log(`auth: DENIED ${email} (not on the allow-list)`);
      return res.status(403).send(page('Not authorised',
        `<b>${escapeHtml(email)}</b> is not on the access list for this tool.<br>` +
        'Ask Finance to add you, then <a href="/auth/login">sign in again</a> — no redeploy needed.'));
    }

    req.session.user = { email, name: claims.name || '', signedInAt: new Date().toISOString() };
    console.log(`auth: signed in ${email}`);
    const dest = safePath(req.session.returnTo);
    delete req.session.returnTo;
    res.redirect(dest);
  });

  app.get('/auth/logout', (req, res) => {
    req.session = null;
    res.send(page('Signed out', 'You have been signed out. <a href="/auth/login">Sign in</a>.'));
  });

  // ---- the gate: everything except /auth/* needs a session that is STILL on the allow-list ----
  // The list is re-read per request (a sync read of a sub-1KB local file — negligible at this
  // app's request volume), so REMOVING an address revokes live sessions on their very next
  // request instead of leaving the 30-day cookie working until it expires.
  app.use((req, res, next) => {
    // never gate sign-in/out — a removed user must still be able to sign back in once re-added
    if (req.path.startsWith('/auth/')) return next();

    const email = req.session && req.session.user && req.session.user.email;
    if (!email) {
      // fetch()-style callers get a 401 they can detect; browsers get the login redirect
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthenticated' });
      return res.redirect('/auth/login?returnTo=' + encodeURIComponent(req.originalUrl || '/'));
    }

    // Fail closed, like canRefresh(): an unreadable list denies everyone rather than admitting
    // them. The session is left intact — the file is broken, the user isn't necessarily gone.
    let allowed;
    try {
      allowed = readAcl().emails.has(email);
    } catch (e) {
      console.error(`auth: DENIED ${email} — cannot read allow-list ${EMAILS_FILE}: ${e.message}`);
      return deny(req, res, 'access list unreadable',
        'The access list could not be read, so access is denied. Ask Finance to check the server.');
    }
    if (!allowed) {
      req.session = null; // drop the cookie now rather than letting it run to expiry
      console.log(`auth: REVOKED ${email} (no longer on the allow-list)`);
      return deny(req, res, 'no longer authorised',
        `<b>${escapeHtml(email)}</b> is no longer on the access list for this tool.<br>` +
        'Ask Finance to add you back, then <a href="/auth/login">sign in again</a> — no redeploy needed.');
    }
    next();
  });

  return {
    enabled: true,
    redirectUri: REDIRECT_URI,
    // May this session trigger a rebuild / upload inputs? Re-reads the allow-list per call.
    // Fail closed: no session / unreadable file / not on the refresh tier → false.
    canRefresh(req) {
      const email = req.session && req.session.user && req.session.user.email;
      if (!email) return false;
      try { const acl = readAcl(); return (acl.refresh || acl.emails).has(email); } catch { return false; }
    },
  };
}

// Refuse a request whose session is authenticated but not (or no longer) authorised.
// Deliberately NOT a redirect: bouncing a revoked user through Google would land them back
// here and loop. /api/* gets JSON so fetch() callers can show the reason; the rest gets a page.
function deny(req, res, jsonError, htmlBody) {
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: jsonError });
  res.status(403).send(page('Not authorised', htmlBody));
}

// Only ever redirect to a local path (open-redirect guard): must start "/" but not "//".
function safePath(p) { return (typeof p === 'string' && /^\/(?!\/)/.test(p)) ? p : '/'; }

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Minimal self-contained page in the app's dark style (matches server/index.js WRAPPER).
function page(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} — Deliveroo Fee Risk Analysis</title>
<style>html,body{margin:0;height:100%;background:#0f1115;color:#e6e9ef;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
display:flex;align-items:center;justify-content:center}main{max-width:420px;padding:32px;background:#161a21;border:1px solid #2a2f3a;border-radius:12px}
h1{font-size:18px;margin:0 0 10px}a{color:#4f8cff}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${bodyHtml}</p></main></body></html>`;
}

module.exports = { attach };
