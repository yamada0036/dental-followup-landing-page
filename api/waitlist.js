const {
  sendJson, readJson, cleanString, normalizeEmail, isValidEmail,
  requireMethod, getUtmFields, readEnv, enforceRateLimit, sendEmail
} = require('./_utils');

const sources = new Set(['unscheduled_text_samples', 'missed_calls', 'dental_recall_text_samples']);

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const limit = await enforceRateLimit(req, 'waitlist');
    if (!limit.allowed) return sendJson(res, 429, { success: false, error: 'Too many requests. Please try again later.' });
  } catch (error) {
    console.error('Waitlist rate limit failed', error);
    return sendJson(res, 503, { success: false, error: 'Unable to join right now. Please try again later.' });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return sendJson(res, 400, { success: false, error: 'Please check your submission.' });
  }
  if (cleanString(payload.company_website, 200)) return sendJson(res, 200, { success: true });

  const email = normalizeEmail(payload.email);
  const practice = cleanString(payload.practice_name, 160);
  const source = cleanString(payload.source, 80);
  if (!email || !isValidEmail(email) || !sources.has(source) || payload.consent !== true) {
    return sendJson(res, 400, { success: false, error: 'Enter a valid email and agree to hear from Praxora.' });
  }

  const recipient = readEnv('PRAXORA_NOTIFICATION_EMAIL');
  if (!recipient) return sendJson(res, 503, { success: false, error: 'Unable to join right now. Please try again later.' });

  const attribution = getUtmFields(payload);
  try {
    await sendEmail({
      to: recipient,
      subject: 'New Praxora early-access waitlist request',
      text: `Email: ${email}\nPractice: ${practice}\nSource: ${source}\nConsent: Requested Praxora early-access updates\nUTM Source: ${attribution.utm_source}\nUTM Medium: ${attribution.utm_medium}\nUTM Campaign: ${attribution.utm_campaign}\nUTM Content: ${attribution.utm_content}`
    });
  } catch (error) {
    console.error('Waitlist delivery failed', error);
    return sendJson(res, 503, { success: false, error: 'Unable to join right now. Please try again later.' });
  }

  return sendJson(res, 200, { success: true });
};
