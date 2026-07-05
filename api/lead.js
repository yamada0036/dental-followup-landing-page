const {
  MAX_LENGTHS,
  sendJson,
  readJson,
  cleanString,
  normalizeEmail,
  isValidEmail,
  safeInteger,
  requireMethod,
  getUtmFields,
  insertSupabase,
  updateSupabase,
  sendEmail,
  formatCurrency,
  leakDisplayNames,
  leakDiagnoses
} = require('./_utils');

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

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    console.error('Invalid calculator JSON', error);
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  if (cleanString(payload.company_website, 200)) {
    return sendJson(res, 200, { success: true, email_sent: false });
  }

  const firstName = cleanString(payload.first_name, MAX_LENGTHS.first_name);
  const email = normalizeEmail(payload.email);
  if (!firstName || !email || !isValidEmail(email)) {
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  const lead = {
    created_at: new Date().toISOString(),
    first_name: firstName,
    email,
    practice_name: cleanString(payload.practice_name, MAX_LENGTHS.practice_name),
    source: 'revenue_leak_calculator',
    largest_leak: cleanString(payload.largest_leak, MAX_LENGTHS.key),
    missed_call_score: safeInteger(payload.missed_call_score),
    unscheduled_treatment_score: safeInteger(payload.unscheduled_treatment_score),
    recall_score: safeInteger(payload.recall_score),
    missed_call_opportunity: safeInteger(payload.missed_call_opportunity),
    unscheduled_treatment_opportunity: safeInteger(payload.unscheduled_treatment_opportunity),
    recall_opportunity: safeInteger(payload.recall_opportunity),
    daily_calls: safeInteger(payload.daily_calls),
    missed_call_rate: cleanString(payload.missed_call_rate, MAX_LENGTHS.key),
    missed_call_followup_rate: cleanString(payload.missed_call_followup_rate, MAX_LENGTHS.key),
    unscheduled_followup_process: cleanString(payload.unscheduled_followup_process, MAX_LENGTHS.key),
    recall_workflow_status: cleanString(payload.recall_workflow_status, MAX_LENGTHS.key),
    ...getUtmFields(payload),
    email_status: 'pending'
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
    return sendJson(res, 200, { success: true, email_sent: emailSent });
  } catch (error) {
    console.error('Calculator lead failed', error);
    return sendJson(res, 500, { success: false, error: 'Unable to process your request.' });
  }
};
