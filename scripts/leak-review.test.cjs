const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'PRAXORA_FROM_EMAIL',
  'PRAXORA_NOTIFICATION_EMAIL',
  'RATE_LIMIT_SALT'
];

function loadHandler() {
  delete require.cache[require.resolve('../api/leak-review')];
  delete require.cache[require.resolve('../api/_utils')];
  return require('../api/leak-review');
}

function setEnv(overrides = {}) {
  const base = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    RESEND_API_KEY: 're_test',
    PRAXORA_FROM_EMAIL: 'Yamada <reviews@getpraxora.com>',
    PRAXORA_NOTIFICATION_EMAIL: 'founder@getpraxora.com',
    RATE_LIMIT_SALT: 'salt-test'
  };
  for (const key of ENV_KEYS) {
    const value = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : base[key];
    if (value === undefined || value === null || value === '') delete process.env[key];
    else process.env[key] = value;
  }
}

function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function validPayload(overrides = {}) {
  return {
    name: 'Test Reviewer',
    email: 'leak-review-test@example.com',
    practice_name: 'Example Dental',
    number_of_locations: '2',
    pms: 'Open Dental',
    missed_call_process: 'Front desk calls back the same day.',
    unscheduled_treatment_process: 'A list is printed weekly.',
    overdue_recall_process: 'Postcards go out monthly.',
    most_frustrating_workflow: 'Missed call follow-up.',
    company_website: '',
    ...overrides
  };
}

function invoke(handler, { method = 'POST', body, raw, ip = '203.0.113.10' } = {}) {
  const encoded = raw !== undefined ? raw : JSON.stringify(body ?? {});
  const req = {
    method,
    headers: { 'x-forwarded-for': ip },
    async *[Symbol.asyncIterator]() {
      if (encoded) yield Buffer.from(encoded);
    }
  };
  if (body && raw === undefined) req.body = body;
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) { this.body = payload; }
  };
  return handler(req, res).then(() => ({ status: res.statusCode, json: res.body ? JSON.parse(res.body) : null }));
}

function installFetch(state) {
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    state.calls.push({ url: target, method: options.method, body: options.body, headers: options.headers });
    if (target.includes('submission_rate_limits') && options.method === 'GET') {
      if (state.rateLimitMode === 'missing') {
        return jsonResponse(404, {
          code: 'PGRST205',
          message: "Could not find the table 'public.submission_rate_limits' in the schema cache"
        });
      }
      if (state.rateLimitMode === 'unauthorized') {
        return jsonResponse(401, { message: 'Invalid API key' });
      }
      const rows = Array.from({ length: state.recentRateLimits || 0 }, (_, index) => ({ id: `rate-${index}` }));
      return jsonResponse(200, rows);
    }
    if (target.includes('submission_rate_limits') && options.method === 'POST') {
      if (state.rateLimitInsertMode === 'missing') {
        return jsonResponse(404, {
          code: 'PGRST205',
          message: "Could not find the table 'public.submission_rate_limits' in the schema cache"
        });
      }
      return jsonResponse(201, [{ id: 'rate-new' }]);
    }
    if (target.includes('/rest/v1/leak_reviews') && options.method === 'POST') {
      if (state.reviewInsertStatus) return jsonResponse(state.reviewInsertStatus, { message: 'insert failed' });
      return jsonResponse(201, [{ id: 'review-1' }]);
    }
    if (target.includes('/rest/v1/leak_reviews') && options.method === 'PATCH') {
      if (state.patchThrows) throw new Error('status update failed');
      return jsonResponse(204, '');
    }
    if (target.includes('api.resend.com')) {
      if (state.resendStatus) return jsonResponse(state.resendStatus, { message: 'email failed' });
      return jsonResponse(200, { id: 'email-1' });
    }
    return jsonResponse(500, { message: `unexpected ${target}` });
  };
}

function reviewInserts(state) {
  return state.calls.filter((call) => call.method === 'POST' && call.url.includes('/rest/v1/leak_reviews'));
}

test('valid review is stored and returns success when services are configured', async () => {
  setEnv();
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload() });

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: true, requester_email_sent: true });
  assert.equal(reviewInserts(state).length, 1);
  const stored = JSON.parse(reviewInserts(state)[0].body);
  assert.equal(stored.name, 'Test Reviewer');
  assert.equal(stored.email, 'leak-review-test@example.com');
  assert.equal(stored.practice_name, 'Example Dental');
  assert.equal(stored.number_of_locations, 2);
  assert.equal(stored.pms, 'Open Dental');
  assert.equal(stored.missed_call_process, 'Front desk calls back the same day.');
  assert.equal(stored.founder_email_status, undefined);
  assert.equal(stored.requester_email_status, undefined);
  const rateLookup = state.calls.find((call) => call.method === 'GET' && call.url.includes('submission_rate_limits'));
  assert.match(rateLookup.url, /created_at=gte\./);
  assert.doesNotMatch(rateLookup.url, /\.\d{3}Z/);
  const rateInsert = state.calls.find((call) => call.method === 'POST' && call.url.includes('submission_rate_limits'));
  const rateRow = JSON.parse(rateInsert.body);
  assert.match(rateRow.request_hash, /^[a-f0-9]{64}$/);
  assert.equal(rateRow.request_hash.includes('203.0.113.10'), false);
  assert.equal(rateLookup.headers.apikey, 'service-role-test');
});

test('trimmed Supabase credentials are accepted', async () => {
  setEnv({
    SUPABASE_URL: ' https://example.supabase.co \n',
    SUPABASE_SERVICE_ROLE_KEY: ' service-role-test\n'
  });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload() });
  assert.equal(result.status, 200);
  const rateLookup = state.calls.find((call) => call.method === 'GET');
  assert.equal(rateLookup.url.startsWith('https://example.supabase.co/rest/v1/submission_rate_limits?'), true);
  assert.equal(rateLookup.headers.Authorization, 'Bearer service-role-test');
});

test('missing dedicated salt still stores a valid review and hashes the address', async () => {
  setEnv({ RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload() });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  const rateRow = JSON.parse(state.calls.find((call) => call.method === 'POST' && call.url.includes('submission_rate_limits')).body);
  assert.match(rateRow.request_hash, /^[a-f0-9]{64}$/);
  assert.equal(rateRow.request_hash.includes('service-role-test'), false);
  assert.equal(rateRow.request_hash.includes('203.0.113.10'), false);
});

test('honeypot submissions do not store a review', async () => {
  setEnv();
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, {
    body: validPayload({ company_website: 'https://spam.example' })
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: false, requester_email_sent: false });
  assert.equal(reviewInserts(state).length, 0);
  assert.equal(state.calls.some((call) => call.url.includes('api.resend.com')), false);
  assert.equal(state.calls.some((call) => call.method === 'POST' && call.url.includes('submission_rate_limits')), true);
});

test('invalid JSON and incomplete reviews are rejected before storage', async () => {
  setEnv();
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const invalid = await invoke(handler, { raw: 'not-json', ip: '203.0.113.11' });
  assert.equal(invalid.status, 400);
  const incomplete = await invoke(handler, { body: { company_website: '', email: 'person@example.com' }, ip: '203.0.113.12' });
  assert.equal(incomplete.status, 400);
  assert.equal(reviewInserts(state).length, 0);
  const method = await invoke(handler, { method: 'GET', raw: '', ip: '203.0.113.13' });
  assert.equal(method.status, 405);
});

test('five prior requests from one address are rejected', async () => {
  setEnv();
  const state = { calls: [], recentRateLimits: 5 };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.14' });
  assert.equal(result.status, 429);
  assert.equal(reviewInserts(state).length, 0);
});

test('missing Supabase configuration fails before email delivery', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.15' });
  assert.equal(result.status, 500);
  assert.equal(result.json.success, false);
  assert.equal(state.calls.length, 0);
});

test('unauthorized Supabase rate-limit reads still fail closed', async () => {
  setEnv();
  const state = { calls: [], rateLimitMode: 'unauthorized' };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.16' });
  assert.equal(result.status, 500);
  assert.equal(reviewInserts(state).length, 0);
});

test('a missing rate-limit table keeps the same limit and still stores reviews', async () => {
  setEnv();
  const state = { calls: [], rateLimitMode: 'missing' };
  installFetch(state);
  const handler = loadHandler();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.17' });
    assert.equal(result.status, 200);
    assert.equal(result.json.success, true);
  }
  const blocked = await invoke(handler, { body: validPayload(), ip: '203.0.113.17' });
  assert.equal(blocked.status, 429);
  assert.equal(reviewInserts(state).length, 5);
});

test('rate-limit insert reporting a missing table still stores the review', async () => {
  setEnv();
  const state = { calls: [], rateLimitInsertMode: 'missing' };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.18' });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(reviewInserts(state).length, 1);
});

test('storage failure stays a server error', async () => {
  setEnv();
  const state = { calls: [], reviewInsertStatus: 400 };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.19' });
  assert.equal(result.status, 500);
  assert.equal(result.json.success, false);
});

test('email failure still returns success for a stored review', async () => {
  setEnv({ RESEND_API_KEY: '', PRAXORA_NOTIFICATION_EMAIL: '' });
  const state = { calls: [], patchThrows: true };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.20' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: false, requester_email_sent: false });
  assert.equal(reviewInserts(state).length, 1);
});
