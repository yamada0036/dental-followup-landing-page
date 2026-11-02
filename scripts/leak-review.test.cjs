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

function loadLeadHandler() {
  delete require.cache[require.resolve('../api/lead')];
  delete require.cache[require.resolve('../api/_utils')];
  delete require.cache[require.resolve('../api/_calculator')];
  return require('../api/lead');
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
    if (state.supabaseThrows && !target.includes('api.resend.com')) {
      throw new Error('getaddrinfo ENOTFOUND');
    }
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
    if (target.includes('/rest/v1/leads') && options.method === 'POST') {
      if (state.leadInsertStatus) return jsonResponse(state.leadInsertStatus, { message: 'insert failed' });
      return jsonResponse(201, [{ id: 'lead-1' }]);
    }
    if (target.includes('/rest/v1/leads') && options.method === 'PATCH') {
      return jsonResponse(204, '');
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

test('missing Supabase configuration still accepts a review and sends email', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, {
    body: validPayload({
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'audit',
      utm_content: 'hero'
    }),
    ip: '203.0.113.15'
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: true, requester_email_sent: true });
  assert.equal(state.calls.some((call) => call.url.includes('supabase.co') || call.url.includes('/rest/v1/')), false);
  const emails = state.calls.filter((call) => call.url.includes('api.resend.com'));
  assert.equal(emails.length, 2);
  const founder = emails.find((call) => JSON.parse(call.body).to === 'founder@getpraxora.com');
  const founderText = JSON.parse(founder.body).text;
  assert.match(founderText, /UTM Source: newsletter/);
  assert.match(founderText, /UTM Campaign: audit/);
  assert.match(founderText, /Example Dental/);
});

test('unauthorized Supabase rate-limit reads fall back to the in-memory limit', async () => {
  setEnv();
  const state = { calls: [], rateLimitMode: 'unauthorized' };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.16' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: true, requester_email_sent: true });
  assert.equal(reviewInserts(state).length, 1);
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

test('storage failure still accepts the review and sends email', async () => {
  setEnv();
  const state = { calls: [], reviewInsertStatus: 400 };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.19' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: true, requester_email_sent: true });
  assert.equal(reviewInserts(state).length, 1);
});

test('a configured Supabase that cannot be reached still accepts a valid review', async () => {
  setEnv();
  const state = { calls: [], supabaseThrows: true };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.40' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: true, requester_email_sent: true });
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 2);
  assert.equal(reviewInserts(state).length, 1);
});

test('invalid JSON stays 400 when a configured Supabase cannot be reached', async () => {
  setEnv();
  const state = { calls: [], supabaseThrows: true };
  installFetch(state);
  const handler = loadHandler();
  const invalid = await invoke(handler, { raw: 'not-json', ip: '203.0.113.41' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.success, false);
  assert.equal(reviewInserts(state).length, 0);
  const incomplete = await invoke(handler, { body: { company_website: '', email: 'person@example.com' }, ip: '203.0.113.42' });
  assert.equal(incomplete.status, 400);
  assert.equal(incomplete.json.success, false);
});

test('auth failures from a configured Supabase still accept a valid review and send email', async () => {
  setEnv();
  const state = { calls: [], rateLimitMode: 'unauthorized', reviewInsertStatus: 401 };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.43' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: true, requester_email_sent: true });
  assert.equal(reviewInserts(state).length, 1);
});

test('failing Supabase still enforces the in-memory limit', async () => {
  setEnv();
  const state = { calls: [], supabaseThrows: true };
  installFetch(state);
  const handler = loadHandler();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.45' });
    assert.equal(result.status, 200);
    assert.equal(result.json.success, true);
  }
  const blocked = await invoke(handler, { body: validPayload(), ip: '203.0.113.45' });
  assert.equal(blocked.status, 429);
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 10);
});

test('failing Supabase and unset email still return success after validation', async () => {
  setEnv({
    RESEND_API_KEY: '',
    PRAXORA_FROM_EMAIL: '',
    PRAXORA_NOTIFICATION_EMAIL: ''
  });
  const state = { calls: [], rateLimitMode: 'unauthorized', reviewInsertStatus: 401 };
  installFetch(state);
  const handler = loadHandler();
  const { result, errors } = await captureErrors(() => invoke(handler, { body: validPayload(), ip: '203.0.113.46' }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: false, requester_email_sent: false });
  assert.equal(errors.some((line) => line.includes('accepted in-process only') && line.includes('leak-review-test@example.com')), true);
});

function captureErrors(fn) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => {
    errors.push(args.map((part) => (typeof part === 'string' ? part : String(part && part.message || part))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then((result) => ({ result, errors }));
}

test('unset Supabase and unset email still return success after validation', async () => {
  setEnv({
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    RESEND_API_KEY: '',
    PRAXORA_FROM_EMAIL: '',
    PRAXORA_NOTIFICATION_EMAIL: '',
    RATE_LIMIT_SALT: ''
  });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const { result, errors } = await captureErrors(() => invoke(handler, { body: validPayload(), ip: '203.0.113.21' }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: false, requester_email_sent: false });
  assert.equal(state.calls.length, 0);
  assert.equal(errors.some((line) => line.includes('accepted in-process only')), true);
  assert.equal(errors.some((line) => line.includes('leak-review-test@example.com')), true);
  assert.equal(reviewInserts(state).length, 0);
});

test('invalid JSON is 400 when Supabase is unset', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const invalid = await invoke(handler, { raw: 'not-json', ip: '203.0.113.22' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.success, false);
  assert.equal(state.calls.length, 0);
  const method = await invoke(handler, { method: 'GET', raw: '', ip: '203.0.113.23' });
  assert.equal(method.status, 405);
});

test('honeypot still skips storage and email when Supabase is unset', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, {
    body: validPayload({ company_website: 'https://spam.example' }),
    ip: '203.0.113.24'
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, founder_email_sent: false, requester_email_sent: false });
  assert.equal(state.calls.length, 0);
});

test('without Supabase the in-memory limit still blocks the sixth request', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.25' });
    assert.equal(result.status, 200);
    assert.equal(result.json.success, true);
  }
  const blocked = await invoke(handler, { body: validPayload(), ip: '203.0.113.25' });
  assert.equal(blocked.status, 429);
  assert.equal(state.calls.some((call) => call.url.includes('supabase.co') || call.url.includes('/rest/v1/')), false);
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 10);
});

test('a partial Supabase configuration is treated as unset', async () => {
  setEnv({ SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadHandler();
  const result = await invoke(handler, { body: validPayload(), ip: '203.0.113.26' });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(state.calls.some((call) => call.url.includes('supabase.co') || call.url.includes('/rest/v1/')), false);
  assert.equal(state.calls.some((call) => call.url.includes('api.resend.com')), true);
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

function validLead(overrides = {}) {
  return {
    first_name: 'Ada',
    email: 'ada@example.com',
    practice_name: 'Example Dental',
    company_website: '',
    daily_calls: 40,
    missed_call_rate: 'ten_to_twenty',
    missed_call_followup_rate: 'less_than_half',
    average_new_patient_value: 500,
    knows_unscheduled_value: 'no',
    unscheduled_patient_count: 120,
    average_treatment_value: 3000,
    unscheduled_followup_process: 'staff_time',
    overdue_recall_count: 300,
    average_recall_value: 180,
    recall_workflow_status: 'partial',
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: 'calc',
    utm_content: 'result',
    ...overrides
  };
}

function leadInserts(state) {
  return state.calls.filter((call) => call.method === 'POST' && call.url.includes('/rest/v1/leads'));
}

test('calculator lead is stored when Supabase is configured', async () => {
  setEnv();
  const state = { calls: [] };
  installFetch(state);
  const handler = loadLeadHandler();
  const result = await invoke(handler, { body: validLead(), ip: '203.0.113.30' });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.email_sent, true);
  assert.equal(result.json.results.largest_leak, 'unscheduled_treatment');
  assert.equal(leadInserts(state).length, 1);
  const stored = JSON.parse(leadInserts(state)[0].body);
  assert.equal(stored.email, 'ada@example.com');
  assert.equal(stored.utm_source, 'newsletter');
  assert.equal(stored.utm_campaign, 'calc');
});

test('calculator lead succeeds without Supabase and still sends email', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadLeadHandler();
  const result = await invoke(handler, { body: validLead(), ip: '203.0.113.31' });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.email_sent, true);
  assert.equal(result.json.results.largest_leak, 'unscheduled_treatment');
  assert.equal(leadInserts(state).length, 0);
  assert.equal(state.calls.some((call) => call.url.includes('supabase.co') || call.url.includes('/rest/v1/')), false);
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 1);
});

test('calculator lead returns success in-process when nothing can deliver it', async () => {
  setEnv({
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    RESEND_API_KEY: '',
    PRAXORA_FROM_EMAIL: '',
    RATE_LIMIT_SALT: ''
  });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadLeadHandler();
  const { result, errors } = await captureErrors(() => invoke(handler, { body: validLead(), ip: '203.0.113.32' }));
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.email_sent, false);
  assert.ok(result.json.results);
  assert.equal(state.calls.length, 0);
  assert.equal(errors.some((line) => line.includes('accepted in-process only') && line.includes('ada@example.com')), true);
});

test('calculator invalid JSON is 400 when Supabase is unset', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadLeadHandler();
  const invalid = await invoke(handler, { raw: 'not-json', ip: '203.0.113.33' });
  assert.equal(invalid.status, 400);
  assert.equal(state.calls.length, 0);
  const honeypot = await invoke(handler, {
    body: validLead({ company_website: 'https://spam.example' }),
    ip: '203.0.113.34'
  });
  assert.equal(honeypot.status, 200);
  assert.deepEqual(honeypot.json, { success: true, email_sent: false, results: null });
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 0);
});

test('calculator storage failure still accepts the lead and sends email', async () => {
  setEnv();
  const state = { calls: [], leadInsertStatus: 400 };
  installFetch(state);
  const handler = loadLeadHandler();
  const result = await invoke(handler, { body: validLead(), ip: '203.0.113.35' });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.email_sent, true);
  assert.equal(result.json.results.largest_leak, 'unscheduled_treatment');
  assert.equal(leadInserts(state).length, 1);
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 1);
});

test('calculator lead succeeds when a configured Supabase cannot be reached', async () => {
  setEnv();
  const state = { calls: [], supabaseThrows: true };
  installFetch(state);
  const handler = loadLeadHandler();
  const result = await invoke(handler, { body: validLead(), ip: '203.0.113.47' });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.email_sent, true);
  assert.equal(state.calls.filter((call) => call.url.includes('api.resend.com')).length, 1);
  const invalid = await invoke(handler, { raw: 'not-json', ip: '203.0.113.48' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.success, false);
});

test('calculator requests share the in-memory limit when Supabase is unset', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RATE_LIMIT_SALT: '' });
  const state = { calls: [] };
  installFetch(state);
  const handler = loadLeadHandler();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await invoke(handler, { body: validLead(), ip: '203.0.113.36' });
    assert.equal(result.status, 200);
  }
  const blocked = await invoke(handler, { body: validLead(), ip: '203.0.113.36' });
  assert.equal(blocked.status, 429);
  assert.equal(leadInserts(state).length, 0);
});
