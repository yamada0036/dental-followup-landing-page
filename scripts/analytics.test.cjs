const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

function browser({ hostname = 'www.getpraxora.com', blockedStorage = false, page = '' } = {}) {
  let resolveConfig;
  const scripts = [];
  let configRequests = 0;
  const values = new Map();
  const context = vm.createContext({
    URLSearchParams, console: { info() {} },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({}), head: { appendChild: s => scripts.push(s) },
      body: { dataset: { page } }
    },
    sessionStorage: {
      setItem(k, v) { if (blockedStorage) throw new Error('SecurityError'); values.set(k, v); },
      getItem(k) { if (blockedStorage) throw new Error('SecurityError'); return values.get(k); }
    },
    fetch: () => { configRequests++; return new Promise(resolve => { resolveConfig = resolve; }); }
  });
  context.window = context;
  context.location = { hostname, search: '?utm_source=search&utm_campaign=workflow' };
  vm.runInContext(source, context);
  return {
    context, scripts, requests: () => configRequests,
    async configure(config = { gaMeasurementId: 'G-TEST123' }, ok = true) {
      resolveConfig({ ok, json: async () => config });
      await new Promise(resolve => setImmediate(resolve));
    },
    events: () => Array.from(context.dataLayer || [], args => Array.from(args))
  };
}

test('early page views and interactions are sent exactly once after config', async () => {
  const app = browser({ page: 'recovery-kit' });
  app.context.trackEvent('calculator_view', { utm_source: 'search' });
  assert.equal(app.events().length, 0);
  await app.configure();
  assert.deepEqual(app.events().map(e => e.slice(0, 2)), [
    ['js', app.events()[0][1]], ['config', 'G-TEST123'],
    ['event', 'recovery_kit_view'], ['event', 'calculator_view']
  ]);
  app.context.trackEvent('calculator_start');
  assert.equal(app.events().filter(e => e[1] === 'calculator_start').length, 1);
  assert.equal(app.scripts.length, 1);
});

for (const hostname of ['localhost', 'dental-followup-landing-page-preview.vercel.app', 'dental-followup-landing-page.vercel.app']) {
  test(`does not load or send production analytics on ${hostname}`, () => {
    const app = browser({ hostname, page: 'recovery-kit' });
    app.context.trackEvent('generate_lead');
    assert.equal(app.requests(), 0);
    assert.equal(app.scripts.length, 0);
    assert.equal(app.events().length, 0);
  });
}

test('blocked storage preserves current UTM and does not prevent initialization', async () => {
  const app = browser({ blockedStorage: true });
  assert.equal(app.context.PraxoraUtm.get().utm_source, 'search');
  await app.configure();
  app.context.trackEvent('generate_lead', app.context.PraxoraUtm.get());
  assert.equal(app.events().at(-1)[2].utm_campaign, 'workflow');
});

for (const [label, config, ok] of [['missing ID', {}, true], ['invalid ID', { gaMeasurementId: 'invalid' }, true], ['HTTP failure', {}, false]]) {
  test(`${label} disables analytics without throwing`, async () => {
    const app = browser({ page: 'recovery-kit' });
    await app.configure(config, ok);
    app.context.trackEvent('generate_lead');
    assert.equal(app.scripts.length, 0);
    assert.equal(app.events().length, 0);
  });
}

test('config API only exposes analytics on canonical production requests', () => {
  const handler = require('../api/config');
  const previous = process.env.PRAXORA_GA_MEASUREMENT_ID;
  try {
    process.env.PRAXORA_GA_MEASUREMENT_ID = 'G-TEST123';
    for (const [host, expected] of [
      ['www.getpraxora.com', 'G-TEST123'],
      ['getpraxora.com', ''],
      ['preview.vercel.app', ''],
      ['localhost:3000', '']
    ]) {
      const headers = {};
      const response = { setHeader(k, v) { headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
      handler({ method: 'GET', headers: { host } }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.gaMeasurementId, expected);
      assert.equal(headers['Cache-Control'], 'no-store');
    }
  } finally {
    if (previous === undefined) delete process.env.PRAXORA_GA_MEASUREMENT_ID; else process.env.PRAXORA_GA_MEASUREMENT_ID = previous;
  }
});
