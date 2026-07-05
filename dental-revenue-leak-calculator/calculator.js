const BUSINESS_DAYS_PER_MONTH = 22;
const MISSED_CALL_BOOKING_OPPORTUNITY_RATE = 0.25;

const calculatorState = {
  dailyCalls: null,
  missedCallRate: null,
  missedCallRateKey: null,
  missedCallFollowupRate: null,
  missedCallFollowupKey: null,
  averageNewPatientValue: null,
  knowsUnscheduledValue: null,
  unscheduledTreatmentValue: null,
  unscheduledPatientCount: null,
  averageTreatmentValue: null,
  unscheduledFollowupProcess: null,
  overdueRecallCount: null,
  averageRecallValue: null,
  recallWorkflowStatus: null,
  utm: {},
  results: { missedCallOpportunity: 0, unscheduledTreatmentOpportunity: 0, recallOpportunity: 0, missedCallScore: 0, unscheduledTreatmentScore: 0, recallScore: 0, largestLeak: null }
};

const optionSets = {
  missed_call_rate: [
    ['less_than_5', 'Less than 5%', 0.03], ['five_to_ten', '5-10%', 0.075], ['ten_to_twenty', '10-20%', 0.15], ['more_than_twenty', 'More than 20%', 0.25], ['unknown', "I'm not sure", 0.10]
  ],
  missed_call_followup_rate: [
    ['almost_all', 'Almost every missed call', 0.90], ['more_than_half', 'More than half', 0.65], ['less_than_half', 'Less than half', 0.35], ['rarely', 'Rarely', 0.10], ['unknown', "I'm not sure", 0.50]
  ],
  knows_unscheduled_value: [['yes', 'Yes', 'yes'], ['no', 'No', 'no'], ['unknown', "I'm not sure", 'unknown']],
  unscheduled_followup_process: [
    ['consistent', 'We have a consistent process', 0.10], ['occasional', 'Follow-up happens occasionally', 0.25], ['staff_time', 'Usually when staff have time', 0.40], ['no_process', 'We do not have a consistent process', 0.55], ['unknown', "I'm not sure", 0.30]
  ],
  recall_workflow_status: [['consistent', 'Yes, consistently', 0.10], ['partial', 'Partially', 0.30], ['no', 'No', 0.50], ['unknown', "I'm not sure", 0.30]]
};

const missedRateScores = { less_than_5: 10, five_to_ten: 25, ten_to_twenty: 50, more_than_twenty: 75, unknown: 35 };
const missedFollowupGapScores = { almost_all: 5, more_than_half: 15, less_than_half: 30, rarely: 50, unknown: 25 };
const treatmentScores = { consistent: 15, occasional: 40, staff_time: 70, no_process: 90, unknown: 50 };
const recallScores = { consistent: 15, partial: 55, no: 90, unknown: 50 };

function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(value || 0)); }
function numberValue(id) { const value = Number(document.getElementById(id)?.value); return Number.isFinite(value) ? value : NaN; }
function selected(name) { const input = document.querySelector(`input[name="${name}"]:checked`); return input ? input.value : ''; }
function selectedData(name) { const input = document.querySelector(`input[name="${name}"]:checked`); return input ? Number(input.dataset.factor) : NaN; }
function setError(key, message = '') { const node = document.querySelector(`[data-error-for="${key}"]`); if (node) node.textContent = message; }
function clearErrors() { document.querySelectorAll('.error-message').forEach((node) => { node.textContent = ''; }); }
function validNumber(id, message) { const input = document.getElementById(id); const value = numberValue(id); if (!input || !Number.isFinite(value) || value < Number(input.min || 0) || value > Number(input.max || Number.MAX_SAFE_INTEGER)) { setError(id, message); return false; } return true; }
function requireOption(name, message) { if (!selected(name)) { setError(name, message); return false; } return true; }

function renderOptions() {
  Object.entries(optionSets).forEach(([group, options]) => {
    const wrap = document.querySelector(`[data-group="${group}"]`);
    if (!wrap) return;
    wrap.innerHTML = options.map(([key, label, factor]) => `<label class="option-card"><input type="radio" name="${group}" value="${key}" data-factor="${factor}"><span>${label}</span></label>`).join('');
  });
}

function captureUTMParameters() {
  const params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) => { calculatorState.utm[key] = params.get(key) || sessionStorage.getItem(`praxora_${key}`) || ''; if (calculatorState.utm[key]) sessionStorage.setItem(`praxora_${key}`, calculatorState.utm[key]); });
}

function trackEvent(eventName, parameters = {}) {
  if (typeof window.gtag === 'function') { window.gtag('event', eventName, parameters); return; }
  console.info('[analytics]', eventName, parameters);
}

function syncTreatmentFields() {
  const value = selected('knows_unscheduled_value');
  document.getElementById('knownTreatmentFields').hidden = value !== 'yes';
  document.getElementById('estimatedTreatmentFields').hidden = value !== 'no' && value !== 'unknown';
}

function validateStepOne() {
  clearErrors();
  let valid = true;
  valid = validNumber('daily_calls', 'Please enter the approximate number of calls your practice receives each day.') && valid;
  valid = requireOption('missed_call_rate', 'Please choose an estimated missed call percentage.') && valid;
  valid = requireOption('missed_call_followup_rate', 'Please choose how consistently missed calls are followed up.') && valid;
  valid = validNumber('average_new_patient_value', 'Please enter the approximate value of a new patient.') && valid;
  if (!valid) return false;
  calculatorState.dailyCalls = numberValue('daily_calls');
  calculatorState.missedCallRateKey = selected('missed_call_rate');
  calculatorState.missedCallRate = selectedData('missed_call_rate');
  calculatorState.missedCallFollowupKey = selected('missed_call_followup_rate');
  calculatorState.missedCallFollowupRate = selectedData('missed_call_followup_rate');
  calculatorState.averageNewPatientValue = numberValue('average_new_patient_value');
  return true;
}

function validateStepTwo() {
  clearErrors();
  let valid = requireOption('knows_unscheduled_value', 'Please choose whether you know the unscheduled treatment value.');
  const knows = selected('knows_unscheduled_value');
  if (knows === 'yes') valid = validNumber('unscheduled_treatment_value', 'Please enter the approximate unscheduled treatment value.') && valid;
  if (knows === 'no' || knows === 'unknown') {
    valid = validNumber('unscheduled_patient_count', 'Please enter the approximate number of unscheduled treatment patients.') && valid;
    valid = validNumber('average_treatment_value', 'Please enter the approximate average treatment plan value.') && valid;
  }
  valid = requireOption('unscheduled_followup_process', 'Please choose how consistently these patients are followed up.') && valid;
  if (!valid) return false;
  calculatorState.knowsUnscheduledValue = knows;
  calculatorState.unscheduledTreatmentValue = knows === 'yes' ? numberValue('unscheduled_treatment_value') : null;
  calculatorState.unscheduledPatientCount = knows === 'yes' ? null : numberValue('unscheduled_patient_count');
  calculatorState.averageTreatmentValue = knows === 'yes' ? null : numberValue('average_treatment_value');
  calculatorState.unscheduledFollowupProcess = selected('unscheduled_followup_process');
  return true;
}

function validateStepThree() {
  clearErrors();
  let valid = true;
  valid = validNumber('overdue_recall_count', 'Please enter the approximate number of overdue recall patients.') && valid;
  valid = validNumber('average_recall_value', 'Please enter the approximate average recall visit value.') && valid;
  valid = requireOption('recall_workflow_status', 'Please choose your recall workflow status.') && valid;
  if (!valid) return false;
  calculatorState.overdueRecallCount = numberValue('overdue_recall_count');
  calculatorState.averageRecallValue = numberValue('average_recall_value');
  calculatorState.recallWorkflowStatus = selected('recall_workflow_status');
  return true;
}

function calculateMissedCallOpportunity() {
  const monthlyCalls = calculatorState.dailyCalls * BUSINESS_DAYS_PER_MONTH;
  const estimatedMissedCalls = monthlyCalls * calculatorState.missedCallRate;
  const unfollowedMissedCalls = estimatedMissedCalls * (1 - calculatorState.missedCallFollowupRate);
  return unfollowedMissedCalls * MISSED_CALL_BOOKING_OPPORTUNITY_RATE * calculatorState.averageNewPatientValue;
}
function baseUnscheduledValue() { return calculatorState.knowsUnscheduledValue === 'yes' ? calculatorState.unscheduledTreatmentValue : calculatorState.unscheduledPatientCount * calculatorState.averageTreatmentValue; }
function calculateUnscheduledTreatmentOpportunity() { return baseUnscheduledValue() * selectedData('unscheduled_followup_process'); }
function calculateRecallOpportunity() { return calculatorState.overdueRecallCount * calculatorState.averageRecallValue * selectedData('recall_workflow_status'); }
function calculateMissedCallScore() { return Math.min(100, missedRateScores[calculatorState.missedCallRateKey] + missedFollowupGapScores[calculatorState.missedCallFollowupKey]); }
function calculateUnscheduledTreatmentScore() { const base = treatmentScores[calculatorState.unscheduledFollowupProcess]; const value = baseUnscheduledValue(); const modifier = value > 500000 ? 15 : value >= 150000 ? 10 : value >= 50000 ? 5 : 0; return Math.min(100, base + modifier); }
function calculateRecallScore() { const base = recallScores[calculatorState.recallWorkflowStatus]; const count = calculatorState.overdueRecallCount; const modifier = count > 1000 ? 15 : count >= 300 ? 10 : count >= 100 ? 5 : 0; return Math.min(100, base + modifier); }
function determineLargestLeak() {
  const scores = calculatorState.results;
  const max = Math.max(scores.unscheduledTreatmentScore, scores.missedCallScore, scores.recallScore);
  if (scores.unscheduledTreatmentScore === max) return 'unscheduled_treatment';
  if (scores.missedCallScore === max) return 'missed_calls';
  return 'overdue_recall';
}
function calculateResults() {
  calculatorState.results.missedCallOpportunity = calculateMissedCallOpportunity();
  calculatorState.results.unscheduledTreatmentOpportunity = calculateUnscheduledTreatmentOpportunity();
  calculatorState.results.recallOpportunity = calculateRecallOpportunity();
  calculatorState.results.missedCallScore = calculateMissedCallScore();
  calculatorState.results.unscheduledTreatmentScore = calculateUnscheduledTreatmentScore();
  calculatorState.results.recallScore = calculateRecallScore();
  calculatorState.results.largestLeak = determineLargestLeak();
}

const resultCopy = {
  missed_calls: { title: 'Missed Calls', diagnosis: 'Your practice may not have a reliable process for moving missed calls back into the patient access workflow.\n\nThe missed call itself is only the first event.\n\nThe larger gap appears when the call is not identified, prioritized, owned, and followed through to an outcome.', workflow: ['Find missed calls', 'Classify call context', 'Prioritize likely patient opportunities', 'Assign or review follow-up', 'Track reply and booking outcome'] },
  unscheduled_treatment: { title: 'Unscheduled Treatment', diagnosis: 'Your practice may already have meaningful treatment opportunity sitting inside the existing patient pipeline.\n\nThe issue may not be patient acquisition.\n\nThe issue may be what happens after a patient leaves without scheduling.', workflow: ['Find open treatment plans', 'Classify why scheduling stopped', 'Prioritize by timing and opportunity', 'Review the recommended next action', 'Follow up', 'Track booking and recovery outcome'] },
  overdue_recall: { title: 'Overdue Recall', diagnosis: 'Your practice may have a recall list, but the list itself does not create a recovery process.\n\nThe gap appears when patients remain overdue without clear prioritization, ownership, or outcome tracking.', workflow: ['Find overdue patients', 'Segment by recall status', 'Prioritize reactivation opportunities', 'Review outreach', 'Follow up', 'Track reactivated patients'] }
};

function renderResults() {
  const data = calculatorState.results;
  const copy = resultCopy[data.largestLeak];
  document.getElementById('largestLeakTitle').textContent = copy.title;
  document.getElementById('resultGrid').innerHTML = `
    <div class="result-metric"><span>Missed Calls</span><strong>${money(data.missedCallOpportunity)}</strong><p>Estimated monthly opportunity at risk</p></div>
    <div class="result-metric"><span>Unscheduled Treatment</span><strong>${money(data.unscheduledTreatmentOpportunity)}</strong><p>Estimated treatment opportunity exposed to follow-up gaps</p></div>
    <div class="result-metric"><span>Overdue Recall</span><strong>${money(data.recallOpportunity)}</strong><p>Estimated recall opportunity exposed to follow-up gaps</p></div>`;
  document.getElementById('diagnosisTitle').textContent = copy.title;
  document.getElementById('diagnosisCopy').innerHTML = copy.diagnosis.split('\n\n').map((text) => `<span>${text}</span>`).join('<br><br>');
  document.getElementById('workflowLine').innerHTML = copy.workflow.map((item) => `<li>${item}</li>`).join('');
}

async function submitLead(payload) {
  const endpoint = window.PRAXORA_LEAD_ENDPOINT;
  if (!endpoint) { console.info('Lead payload:', payload); throw new Error('Lead endpoint is not configured.'); }
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error('Lead submission failed.');
  return response.json().catch(() => ({}));
}

function leadPayload(form) {
  const formData = new FormData(form);
  return {
    first_name: formData.get('first_name') || '', email: formData.get('email') || '', practice_name: formData.get('practice_name') || '', source: 'revenue_leak_calculator', largest_leak: calculatorState.results.largestLeak,
    missed_call_score: calculatorState.results.missedCallScore, unscheduled_treatment_score: calculatorState.results.unscheduledTreatmentScore, recall_score: calculatorState.results.recallScore,
    missed_call_opportunity: Math.round(calculatorState.results.missedCallOpportunity), unscheduled_treatment_opportunity: Math.round(calculatorState.results.unscheduledTreatmentOpportunity), recall_opportunity: Math.round(calculatorState.results.recallOpportunity),
    daily_calls: calculatorState.dailyCalls, missed_call_rate: calculatorState.missedCallRateKey, missed_call_followup_rate: calculatorState.missedCallFollowupKey, unscheduled_followup_process: calculatorState.unscheduledFollowupProcess, recall_workflow_status: calculatorState.recallWorkflowStatus,
    utm_source: calculatorState.utm.utm_source || '', utm_medium: calculatorState.utm.utm_medium || '', utm_campaign: calculatorState.utm.utm_campaign || '', utm_content: calculatorState.utm.utm_content || '', created_at: new Date().toISOString()
  };
}

function showStep(step) {
  document.querySelectorAll('.calc-step').forEach((node) => node.classList.toggle('active', node.dataset.step === String(step)));
  document.querySelectorAll('[data-progress]').forEach((node) => node.classList.toggle('active', Number(node.dataset.progress) <= step));
}

function initCalculator() {
  renderOptions(); captureUTMParameters(); trackEvent('calculator_view');
  document.getElementById('startCalculator')?.addEventListener('click', () => { document.getElementById('calculatorApp').scrollIntoView({ behavior: 'smooth' }); trackEvent('calculator_start'); });
  document.querySelector('[data-group="knows_unscheduled_value"]').addEventListener('change', syncTreatmentFields);
  document.querySelectorAll('[data-next]').forEach((button) => button.addEventListener('click', () => {
    const step = Number(button.closest('.calc-step').dataset.step);
    if (step === 1 && validateStepOne()) { trackEvent('calculator_step_1_complete'); showStep(2); }
    if (step === 2 && validateStepTwo()) { trackEvent('calculator_step_2_complete'); showStep(3); }
  }));
  document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => showStep(Number(button.closest('.calc-step').dataset.step) - 1)));
  document.querySelector('[data-results]').addEventListener('click', () => {
    if (!validateStepThree()) return;
    trackEvent('calculator_step_3_complete'); calculateResults(); renderResults();
    document.getElementById('calculatorForm').hidden = true; document.getElementById('resultView').hidden = false;
    trackEvent('calculator_result_view', calculatorState.results); trackEvent(`calculator_largest_leak_${calculatorState.results.largestLeak === 'missed_calls' ? 'missed_call' : calculatorState.results.largestLeak}`);
  });
  document.getElementById('calculatorLeadForm').addEventListener('submit', async (event) => {
    event.preventDefault(); clearErrors();
    const form = event.currentTarget; const status = form.querySelector('[data-form-status]');
    let valid = true;
    if (!form.first_name.value.trim()) { setError('first_name', 'Please enter your first name.'); valid = false; }
    if (!form.email.value.trim() || !form.email.validity.valid) { setError('email', 'Please enter a valid work email.'); valid = false; }
    if (!valid) return;
    try { status.textContent = 'Submitting...'; status.classList.remove('error'); trackEvent('calculator_email_submit'); await submitLead(leadPayload(form)); status.textContent = 'Request received.'; trackEvent('calculator_email_submit_success'); }
    catch (error) { status.textContent = 'Email delivery is not configured yet.'; status.classList.add('error'); trackEvent('calculator_email_submit_error', { message: error.message }); }
  });
}

initCalculator();

