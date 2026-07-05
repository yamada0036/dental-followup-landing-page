const {
  MAX_LENGTHS,
  sendJson,
  readJson,
  cleanString,
  normalizeEmail,
  isValidEmail,
  requireMethod,
  getUtmFields,
  insertSupabase,
  updateSupabase,
  enforceRateLimit,
  sendEmail,
  formatCurrency,
  leakDisplayNames,
  leakDiagnoses
} = require('./_utils');
const { normalizeCalculatorInputs, calculateResults } = require('./_calculator');

function buildBreakdownEmail(lead) {
  const largestLeakName = leakDisplayNames[lead.largest_leak] || 'Follow-Up Leakage';
  const diagnosis = leakDiagnoses[lead.largest_leak] || '';
  const recoveryKitUrl = 'https://dental-followup-landing-page.vercel.app/follow-up-recovery-kit/';
  return `Hi ${lead.first_name},

Based on the information you entered, your largest estimated follow-up gap appears to be:

${largestLeakName}

${diagnosis}

Your estimated workflow exposure:

Missed Calls
${formatCurrency(lead.missed_call_opportunity)}

Unscheduled Treatment
${formatCurrency(lead.unscheduled_treatment_opportunity)}

Overdue Recall
${formatCurrency(lead.recall_opportunity)}

These are directional estimates based on the information you provided and general workflow assumptions. They are not guaranteed revenue or recovery outcomes.

What matters most is where your follow-up process may be breaking.

The recovery framework I use is:

Find
-> Classify
-> Prioritize
-> Human Review
-> Follow Up
-> Recover

I also put together three practical workflows covering missed calls, unscheduled treatment, and overdue recall.

View the Dental Follow-Up Recovery Kit:

${recoveryKitUrl}

Yamada
Founder, Praxora`;
}

async function enrollLeadInRecoverySequence() {
  return { enrolled: false, reason: 'provider_not_configured' };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const rateLimit = await enforceRateLimit(req, 'lead');
    if (!rateLimit.allowed) {
      return sendJson(res, 429, { success: false, error: 'Too many requests. Please try again later.' });
    }
  } catch (error) {
    console.error('Calculator rate limit failed', error);
    return sendJson(res, 500, { success: false, error: 'Unable to process your request.' });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    console.error('Invalid calculator JSON', error);
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  if (cleanString(payload.company_website, 200)) {
    return sendJson(res, 200, { success: true, email_sent: false, results: null });
  }

  const firstName = cleanString(payload.first_name, MAX_LENGTHS.first_name);
  const email = normalizeEmail(payload.email);
  if (!firstName || !email || !isValidEmail(email)) {
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  let inputs;
  let results;
  try {
    inputs = normalizeCalculatorInputs(payload);
    results = calculateResults(inputs);
  } catch (error) {
    console.error('Calculator validation failed', error.message);
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  const sequence = await enrollLeadInRecoverySequence();
  const lead = {
    created_at: new Date().toISOString(),
    first_name: firstName,
    email,
    practice_name: cleanString(payload.practice_name, MAX_LENGTHS.practice_name),
    source: 'revenue_leak_calculator',
    largest_leak: results.largest_leak,
    missed_call_score: results.missed_call_score,
    unscheduled_treatment_score: results.unscheduled_treatment_score,
    recall_score: results.recall_score,
    missed_call_opportunity: results.missed_call_opportunity,
    unscheduled_treatment_opportunity: results.unscheduled_treatment_opportunity,
    recall_opportunity: results.recall_opportunity,
    daily_calls: inputs.daily_calls,
    missed_call_rate: inputs.missed_call_rate,
    missed_call_followup_rate: inputs.missed_call_followup_rate,
    average_new_patient_value: inputs.average_new_patient_value,
    knows_unscheduled_value: inputs.knows_unscheduled_value,
    unscheduled_treatment_value: inputs.unscheduled_treatment_value,
    unscheduled_patient_count: inputs.unscheduled_patient_count,
    average_treatment_value: inputs.average_treatment_value,
    unscheduled_followup_process: inputs.unscheduled_followup_process,
    overdue_recall_count: inputs.overdue_recall_count,
    average_recall_value: inputs.average_recall_value,
    recall_workflow_status: inputs.recall_workflow_status,
    ...getUtmFields(payload),
    email_status: 'pending',
    sequence_status: sequence.enrolled ? 'enrolled' : 'not_enrolled'
  };

  try {
    const stored = await insertSupabase('leads', lead);
    let emailSent = false;
    try {
      await sendEmail({
        to: email,
        subject: 'Your follow-up leakage breakdown',
        text: buildBreakdownEmail(lead)
      });
      emailSent = true;
      await updateSupabase('leads', stored && stored.id, { email_status: 'sent' });
    } catch (emailError) {
      console.error('Calculator email failed', emailError);
      await updateSupabase('leads', stored && stored.id, { email_status: 'failed' });
    }
    return sendJson(res, 200, { success: true, email_sent: emailSent, results });
  } catch (error) {
    console.error('Calculator lead failed', error);
    return sendJson(res, 500, { success: false, error: 'Unable to process your request.' });
  }
};
