const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/waitlist');

async function submit(body, ip) {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } };
  let response;
  const res = {
    setHeader() {},
    end(text) { response = { status: this.statusCode, body: JSON.parse(text) }; }
  };
  await handler(req, res);
  return response;
}

test('a waitlist request succeeds only after founder notification is delivered', async () => {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    PRAXORA_FROM_EMAIL: process.env.PRAXORA_FROM_EMAIL,
    PRAXORA_NOTIFICATION_EMAIL: process.env.PRAXORA_NOTIFICATION_EMAIL
  };
  const originalFetch = global.fetch;
  const request = { email: 'manager@example.com', source: 'unscheduled_text_samples', consent: true };
  try {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.PRAXORA_FROM_EMAIL = 'hello@example.com';
    process.env.PRAXORA_NOTIFICATION_EMAIL = 'founder@example.com';
    let sent;
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      sent = JSON.parse(options.body);
      return { ok: true, text: async () => '{}' };
    };
    const accepted = await submit(request, '198.51.100.31');
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.success, true);
    assert.equal(sent.to, 'founder@example.com');
    assert.match(sent.text, /manager@example\.com/);

    global.fetch = async () => ({ ok: false, status: 503, text: async () => '{}' });
    const failed = await submit(request, '198.51.100.32');
    assert.equal(failed.status, 503);
    assert.equal(failed.body.success, false);
    assert.equal((await submit({ ...request, consent: false }, '198.51.100.33')).status, 400);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
