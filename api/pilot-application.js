const {
  sendJson, readJson, cleanString, normalizeEmail, isValidEmail,
  requireMethod, enforceRateLimit, readEnv, sendEmail, getUtmFields
} = require('./_utils');

const ROLES = new Set(['owner', 'office_manager', 'clinician', 'other']);
const WORKFLOWS = new Set(['unscheduled_treatment', 'missed_calls', 'overdue_recall']);

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res)) return;
  try {
    const limit = await enforceRateLimit(req, 'pilot-application');
    if (!limit.allowed) return sendJson(res, 429, { success: false, error: 'Too many requests. Please try again later.' });
  } catch (error) {
    console.error('Pilot rate limit failed', error);
    return sendJson(res, 503, { success: false, error: 'Unable to submit right now. Please try again later.' });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return sendJson(res, 400, { success: false, error: 'Please check your application.' });
  }
  if (cleanString(payload.company_website, 200)) return sendJson(res, 200, { success: true });

  const name = cleanString(payload.name, 120);
  const email = normalizeEmail(payload.email);
  const practice = cleanString(payload.practice_name, 160);
  const role = cleanString(payload.role, 80);
  const workflow = cleanString(payload.workflow, 80);
  const locations = cleanString(payload.locations, 20);
  if (!name || !isValidEmail(email) || !practice || !ROLES.has(role) || !WORKFLOWS.has(workflow)
      || !['1', '2-5', '6+'].includes(locations) || payload.consent !== true) {
    return sendJson(res, 400, { success: false, error: 'Complete the required practice fields and consent.' });
  }

  const recipient = readEnv('PRAXORA_NOTIFICATION_EMAIL');
  if (!recipient) return sendJson(res, 503, { success: false, error: 'Unable to submit right now. Please try again later.' });
  const utm = getUtmFields(payload);
  try {
    await sendEmail({
      to: recipient,
      subject: 'New Praxora pilot application',
      text: `Name: ${name}\nWork email: ${email}\nPractice: ${practice}\nRole: ${role}\nPrimary follow-up workflow: ${workflow}\nLocations: ${locations}\nConsent: Requested contact about a possible pilot\nUTM Source: ${utm.utm_source}\nUTM Medium: ${utm.utm_medium}\nUTM Campaign: ${utm.utm_campaign}\nUTM Content: ${utm.utm_content}`
    });
  } catch (error) {
    console.error('Pilot application delivery failed', error);
    return sendJson(res, 503, { success: false, error: 'Unable to submit right now. Please try again later.' });
  }
  return sendJson(res, 200, { success: true });
};
