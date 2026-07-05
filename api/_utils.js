const crypto = require('crypto');

const MAX_LENGTHS = {
  name: 120,
  first_name: 80,
  email: 254,
  practice_name: 160,
  pms: 120,
  text: 2000,
  key: 80
};

function sendJson(res, statusCode, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function cleanString(value, max = MAX_LENGTHS.text) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function normalizeEmail(value) {
  return cleanString(value, MAX_LENGTHS.email).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}

function safeInteger(value, fallback = 0) {
  return Math.round(safeNumber(value, fallback));
}

function requireMethod(req, res, method = 'POST') {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  sendJson(res, 405, { success: false, error: 'Method not allowed.' });
  return false;
}

function getUtmFields(payload) {
  return {
    utm_source: cleanString(payload.utm_source, MAX_LENGTHS.key),
    utm_medium: cleanString(payload.utm_medium, MAX_LENGTHS.key),
    utm_campaign: cleanString(payload.utm_campaign, MAX_LENGTHS.key),
    utm_content: cleanString(payload.utm_content, MAX_LENGTHS.key)
  };
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function supabaseBaseUrl() {
  const config = supabaseConfig();
  if (!config.url || !config.key) throw new Error('Supabase environment variables are missing.');
  return { baseUrl: config.url.replace(/\/$/, ''), key: config.key };
}

function supabaseHeaders(extra = {}) {
  const { key } = supabaseBaseUrl();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function insertSupabase(table, record) {
  const { baseUrl } = supabaseBaseUrl();
  const response = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(record)
  });
  const text = await response.text();
  if (!response.ok) {
    console.error('Supabase insert failed', { table, status: response.status, body: text });
    throw new Error('Lead storage failed.');
  }
  try { return JSON.parse(text)[0] || null; } catch { return null; }
}

async function updateSupabase(table, id, patch) {
  if (!id) return;
  const { baseUrl } = supabaseBaseUrl();
  const response = await fetch(`${baseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('Supabase update failed', { table, status: response.status, body: text });
  }
}

async function selectSupabase(table, query) {
  const { baseUrl } = supabaseBaseUrl();
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: supabaseHeaders()
  });
  const text = await response.text();
  if (!response.ok) {
    console.error('Supabase select failed', { table, status: response.status, body: text });
    throw new Error('Supabase select failed.');
  }
  return JSON.parse(text || '[]');
}

function getRequestIp(req) {
  const forwarded = cleanString(req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']), 300);
  if (forwarded) return forwarded.split(',')[0].trim();
  return cleanString(req.headers && (req.headers['x-real-ip'] || req.headers['X-Real-IP']), 120) || cleanString(req.socket && req.socket.remoteAddress, 120) || 'unknown';
}

function hashRequestIp(ip) {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) throw new Error('RATE_LIMIT_SALT is missing.');
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

async function enforceRateLimit(req, endpoint) {
  const requestHash = hashRequestIp(getRequestIp(req));
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    select: 'id',
    request_hash: `eq.${requestHash}`,
    endpoint: `eq.${endpoint}`,
    created_at: `gte.${tenMinutesAgo}`
  }).toString();
  const recent = await selectSupabase('submission_rate_limits', query);
  if (recent.length >= 5) {
    return { allowed: false };
  }
  await insertSupabase('submission_rate_limits', {
    request_hash: requestHash,
    endpoint,
    created_at: new Date().toISOString()
  });
  return { allowed: true };
}

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PRAXORA_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Resend environment variables are missing.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, text })
  });
  const body = await response.text();
  if (!response.ok) {
    console.error('Resend send failed', { status: response.status, body });
    throw new Error('Email delivery failed.');
  }
  return body;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(safeNumber(value)));
}

const leakDisplayNames = {
  missed_calls: 'Missed Calls',
  unscheduled_treatment: 'Unscheduled Treatment',
  overdue_recall: 'Overdue Recall'
};

const leakDiagnoses = {
  missed_calls: 'Your practice may not have a reliable process for moving missed calls back into the patient access workflow.\n\nThe larger gap may appear when a missed call is not identified, prioritized, owned, and followed through to an outcome.',
  unscheduled_treatment: 'Your practice may already have meaningful treatment opportunity sitting inside the existing patient pipeline.\n\nThe issue may be what happens after a patient leaves without scheduling.',
  overdue_recall: 'Your practice may have a recall list, but the list itself does not create a recovery process.\n\nThe gap may appear when overdue patients have no clear next action, owner, or tracked outcome.'
};

module.exports = {
  MAX_LENGTHS,
  sendJson,
  readJson,
  cleanString,
  normalizeEmail,
  isValidEmail,
  safeNumber,
  safeInteger,
  requireMethod,
  getUtmFields,
  insertSupabase,
  updateSupabase,
  selectSupabase,
  enforceRateLimit,
  sendEmail,
  formatCurrency,
  leakDisplayNames,
  leakDiagnoses
};
