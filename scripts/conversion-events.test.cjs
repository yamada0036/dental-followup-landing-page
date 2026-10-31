const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptSource = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const calculatorSource = fs.readFileSync(path.join(__dirname, '../dental-revenue-leak-calculator/calculator.js'), 'utf8');
const email = 'ada.lovelace@smile-dental.example';
const personName = 'Ada Lovelace';
const practiceName = 'Smile Dental Practice';

function element(props = {}) {
  const el = {
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    className: '',
    checked: false,
    min: '',
    max: '',
    validity: { valid: true },
    dataset: {},
    listeners: {},
    ...props
  };
  el.classList = { add() {}, remove() {}, toggle() {} };
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  el.dispatch = async (type, event = {}) => {
    const ev = { preventDefault() {}, currentTarget: el, target: el, ...event };
    for (const fn of el.listeners[type] || []) await fn(ev);
  };
  return el;
}

async function flush() {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function bootAudit(api) {
  const requests = [];
  const status = element();
  const button = element({ textContent: 'Request My Follow-Up Leak Review' });
  const emailNotice = element({ hidden: true });
  const success = element({ hidden: true });
  success.querySelector = (sel) => (sel === '[data-requester-email-status]' ? emailNotice : null);
  const form = element();
  form.querySelector = (sel) => {
    if (sel === 'button[type="submit"]') return button;
    if (sel === '[data-form-status]') return status;
    if (sel.startsWith('[data-error-for=')) return element();
    return null;
  };
  form.querySelectorAll = () => [];
  const ids = {
    review_name: element({ value: personName }),
    review_email: element({ value: email, validity: { valid: true } }),
    review_practice: element({ value: practiceName }),
    leakReviewSuccess: success
  };
  const context = vm.createContext({
    URLSearchParams,
    console: { info() {} },
    FormData: function FormData() {
      return { entries: () => [['name', personName], ['email', email], ['practice_name', practiceName]] };
    },
    document: {
      getElementById: (id) => ids[id] || null,
      querySelector: (sel) => (sel === '[data-leak-review-form]' ? form : null),
      querySelectorAll: () => [],
      createElement: () => ({}),
      head: { appendChild() {} },
      body: { dataset: { page: '' } }
    },
    sessionStorage: { setItem() {}, getItem() { return null; } },
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes('leak-review')) return api();
      return { ok: true, json: async () => ({ gaMeasurementId: 'G-TEST123' }) };
    }
  });
  context.window = context;
  context.location = { hostname: 'www.getpraxora.com', search: '?utm_source=newsletter&utm_campaign=audit' };
  vm.runInContext(scriptSource, context);
  return {
    form,
    requests,
    ids,
    success,
    button,
    events: () => Array.from(context.dataLayer || [], (args) => Array.from(args))
  };
}

function eventNames(events) {
  return events.filter((entry) => entry[0] === 'event').map((entry) => entry[1]);
}

function assertNoPii(payload) {
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(email), false);
  assert.equal(serialized.includes(personName), false);
  assert.equal(serialized.includes(practiceName), false);
}

test('audit form emits generate_lead only after the API accepts it', async () => {
  const app = bootAudit(() => ({ ok: true, json: async () => ({ success: true, requester_email_sent: false }) }));
  await flush();
  assert.equal(eventNames(app.events()).includes('generate_lead'), false);
  await app.form.dispatch('submit');
  await flush();

  const names = eventNames(app.events());
  assert.deepEqual(names.filter((name) => name.startsWith('leak_') || name === 'generate_lead'), [
    'leak_review_submit',
    'leak_review_submit_success',
    'generate_lead'
  ]);
  assert.equal(names.includes('form_submit'), false);
  assert.equal(names.includes('form_start'), false);
  const lead = app.events().find((entry) => entry[1] === 'generate_lead')[2];
  assert.equal(lead.lead_source, 'leak_review');
  assert.equal(lead.form_name, 'free_missed_revenue_audit');
  assert.equal(lead.utm_source, 'newsletter');
  assert.equal(lead.utm_campaign, 'audit');
  assertNoPii(app.events());
  assert.equal(app.success.hidden, false);
  assert.equal(app.requests.filter((url) => url.includes('leak-review')).length, 1);
});

test('audit form does not emit a lead event for validation or API failure', async () => {
  const invalid = bootAudit(() => { throw new Error('API should not be called'); });
  await flush();
  invalid.ids.review_email.validity.valid = false;
  await invalid.form.dispatch('submit');
  await flush();
  assert.equal(eventNames(invalid.events()).includes('generate_lead'), false);
  assert.equal(invalid.requests.some((url) => url.includes('leak-review')), false);

  const failed = bootAudit(() => ({ ok: false, json: async () => ({ success: false }) }));
  await flush();
  await failed.form.dispatch('submit');
  await flush();
  const names = eventNames(failed.events());
  assert.deepEqual(names.filter((name) => name.startsWith('leak_') || name === 'generate_lead'), [
    'leak_review_submit',
    'leak_review_submit_error'
  ]);
  assert.equal(failed.button.disabled, false);
  assertNoPii(failed.events());
});

function bootCalculator(leadApi) {
  const events = [];
  const byId = new Map();
  const radios = [];
  const groups = {};
  const errors = new Map();
  const numberInput = (id, value) => {
    const input = element({ id, value: value == null ? '' : String(value), min: '1', max: '10000000' });
    byId.set(id, input);
    return input;
  };
  const radio = (name, value, factor, checked = false) => {
    radios.push(element({ name, value, checked, dataset: { factor: String(factor) } }));
  };
  ['missed_call_rate', 'missed_call_followup_rate', 'knows_unscheduled_value', 'unscheduled_followup_process', 'recall_workflow_status'].forEach((name) => {
    groups[name] = element({ dataset: { group: name } });
  });
  numberInput('daily_calls', '40');
  numberInput('average_new_patient_value', '500');
  numberInput('unscheduled_treatment_value', '');
  numberInput('unscheduled_patient_count', '120');
  numberInput('average_treatment_value', '3000');
  numberInput('overdue_recall_count', '300');
  numberInput('average_recall_value', '180');
  radio('missed_call_rate', 'ten_to_twenty', 0.15, true);
  radio('missed_call_followup_rate', 'less_than_half', 0.35, true);
  radio('knows_unscheduled_value', 'no', 'no', true);
  radio('unscheduled_followup_process', 'staff_time', 0.4, true);
  radio('recall_workflow_status', 'partial', 0.3, true);
  ['largestLeakTitle', 'resultGrid', 'diagnosisTitle', 'diagnosisCopy', 'workflowLine', 'calculatorForm', 'resultView', 'knownTreatmentFields', 'estimatedTreatmentFields'].forEach((id) => {
    byId.set(id, element({ id }));
  });
  const calculatorApp = element({ id: 'calculatorApp' });
  calculatorApp.scrollIntoView = () => {};
  byId.set('calculatorApp', calculatorApp);
  const startCalculator = element({ id: 'startCalculator' });
  byId.set('startCalculator', startCalculator);
  const stepButton = (step) => {
    const button = element();
    button.closest = (sel) => (sel === '.calc-step' ? element({ dataset: { step: String(step) } }) : null);
    return button;
  };
  const nextButtons = [stepButton(1), stepButton(2)];
  const resultsButton = element();
  const status = element();
  const leadForm = element({ id: 'calculatorLeadForm' });
  leadForm.first_name = element({ value: personName });
  leadForm.email = element({ value: email, validity: { valid: true } });
  leadForm.querySelector = (sel) => {
    if (sel === '[data-form-status]') return status;
    if (sel === 'button[type="submit"]') return element({ textContent: 'Email Me My Recovery Breakdown' });
    return null;
  };
  byId.set('calculatorLeadForm', leadForm);

  const context = vm.createContext({
    console: { info() {}, warn() {} },
    FormData: function FormData() {
      return {
        get(name) {
          return { first_name: personName, email, practice_name: practiceName, company_website: '' }[name] || '';
        }
      };
    },
    document: {
      getElementById: (id) => byId.get(id) || null,
      querySelector(sel) {
        if (sel === '[data-results]') return resultsButton;
        const groupMatch = /^\[data-group="([^"]+)"\]$/.exec(sel);
        if (groupMatch) return groups[groupMatch[1]] || null;
        const checked = /^input\[name="([^"]+)"\]:checked$/.exec(sel);
        if (checked) return radios.find((input) => input.name === checked[1] && input.checked) || null;
        const error = /^\[data-error-for="([^"]+)"\]$/.exec(sel);
        if (error) {
          if (!errors.has(error[1])) errors.set(error[1], element());
          return errors.get(error[1]);
        }
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '[data-next]') return nextButtons;
        return [];
      }
    },
    fetch: async () => (leadApi ? leadApi() : { ok: true, json: async () => ({ success: true, email_sent: true }) })
  });
  context.window = context;
  context.trackEvent = (name, params = {}) => events.push({ name, params: { ...params } });
  context.PraxoraUtm = {
    persist() {},
    get: () => ({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'audit', utm_content: '' })
  };
  vm.runInContext(calculatorSource, context);
  return { events, startCalculator, nextButtons, resultsButton, leadForm, byId };
}

function names(app) {
  return app.events.map((event) => event.name);
}

test('calculator_complete fires once when the estimate is shown, not on view or start', async () => {
  const app = bootCalculator();
  assert.deepEqual(names(app), ['calculator_view']);
  await app.startCalculator.dispatch('click');
  assert.equal(names(app).includes('calculator_complete'), false);
  assert.equal(names(app).includes('calculator_start'), true);

  app.byId.get('daily_calls').value = '';
  await app.nextButtons[0].dispatch('click');
  assert.equal(names(app).includes('calculator_step_1_complete'), false);
  app.byId.get('daily_calls').value = '40';
  await app.nextButtons[0].dispatch('click');
  await app.nextButtons[1].dispatch('click');
  assert.equal(names(app).includes('calculator_step_1_complete'), true);
  assert.equal(names(app).includes('calculator_step_2_complete'), true);
  assert.equal(names(app).includes('calculator_complete'), false);

  app.byId.get('overdue_recall_count').value = '';
  await app.resultsButton.dispatch('click');
  assert.equal(names(app).includes('calculator_complete'), false);
  app.byId.get('overdue_recall_count').value = '300';
  await app.resultsButton.dispatch('click');
  await app.resultsButton.dispatch('click');

  const completed = app.events.filter((event) => event.name === 'calculator_complete');
  assert.equal(completed.length, 1);
  assert.ok(['missed_calls', 'unscheduled_treatment', 'overdue_recall'].includes(completed[0].params.largest_leak));
  assert.equal(completed[0].params.utm_source, 'newsletter');
  assert.equal(names(app).filter((name) => name === 'calculator_result_view').length, 1);
  assert.equal(names(app).includes('form_submit'), false);
  assertNoPii(app.events);
  assert.equal(app.byId.get('resultView').hidden, false);
});

test('calculator email emits generate_lead only after a saved lead', async () => {
  const savedWithoutEmail = bootCalculator(() => ({ ok: true, json: async () => ({ success: true, email_sent: false }) }));
  await savedWithoutEmail.leadForm.dispatch('submit');
  const lead = savedWithoutEmail.events.find((event) => event.name === 'generate_lead');
  assert.equal(lead.params.lead_source, 'revenue_leak_calculator');
  assert.equal(lead.params.form_name, 'revenue_leak_calculator');
  assert.equal(names(savedWithoutEmail).includes('calculator_email_submit_success'), true);
  assert.equal(names(savedWithoutEmail).includes('calculator_email_submit_error'), false);
  assertNoPii(savedWithoutEmail.events);

  const invalid = bootCalculator();
  invalid.leadForm.email.validity.valid = false;
  await invalid.leadForm.dispatch('submit');
  assert.equal(names(invalid).includes('generate_lead'), false);
  assert.equal(names(invalid).includes('calculator_email_submit'), false);

  const failed = bootCalculator(() => ({ ok: false, json: async () => ({ success: false }) }));
  await failed.leadForm.dispatch('submit');
  assert.deepEqual(names(failed).filter((name) => name.startsWith('calculator_email') || name === 'generate_lead'), [
    'calculator_email_submit',
    'calculator_email_submit_error'
  ]);
  assertNoPii(failed.events);
});
