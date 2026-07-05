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
  sendEmail
} = require('./_utils');

function founderNotification(review) {
  return `Name: ${review.name}
Email: ${review.email}
Practice: ${review.practice_name}
Number of Locations: ${review.number_of_locations || ''}
PMS: ${review.pms || ''}

Missed Call Process
${review.missed_call_process || ''}

Unscheduled Treatment Process
${review.unscheduled_treatment_process || ''}

Overdue Recall Process
${review.overdue_recall_process || ''}

Most Frustrating Workflow
${review.most_frustrating_workflow || ''}

UTM Source: ${review.utm_source || ''}
UTM Medium: ${review.utm_medium || ''}
UTM Campaign: ${review.utm_campaign || ''}
UTM Content: ${review.utm_content || ''}`;
}

function requesterConfirmation(review) {
  return `Hi ${review.name},

Thanks for sharing how your follow-up process currently works.

I've received your review request.

I'll use the workflow information you provided to look at where missed calls, unscheduled treatment, or overdue recall may be falling out of the normal process.

No patient data is needed for this review.

Yamada
Founder, Praxora`;
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    console.error('Invalid leak review JSON', error);
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  if (cleanString(payload.company_website, 200)) {
    return sendJson(res, 200, { success: true, email_sent: false });
  }

  const name = cleanString(payload.name, MAX_LENGTHS.name);
  const email = normalizeEmail(payload.email);
  const practiceName = cleanString(payload.practice_name, MAX_LENGTHS.practice_name);
  if (!name || !email || !practiceName || !isValidEmail(email)) {
    return sendJson(res, 400, { success: false, error: 'Unable to process your request.' });
  }

  const review = {
    created_at: new Date().toISOString(),
    name,
    email,
    practice_name: practiceName,
    number_of_locations: payload.number_of_locations ? safeInteger(payload.number_of_locations) : null,
    pms: cleanString(payload.pms, MAX_LENGTHS.key),
    missed_call_process: cleanString(payload.missed_call_process || payload.missed_calls_handling, MAX_LENGTHS.text),
    unscheduled_treatment_process: cleanString(payload.unscheduled_treatment_process || payload.unscheduled_treatment_followup, MAX_LENGTHS.text),
    overdue_recall_process: cleanString(payload.overdue_recall_process || payload.overdue_recall_handling, MAX_LENGTHS.text),
    most_frustrating_workflow: cleanString(payload.most_frustrating_workflow, MAX_LENGTHS.text),
    ...getUtmFields(payload),
    review_status: 'new',
    notes: ''
  };

  try {
    await insertSupabase('leak_reviews', review);
    let emailSent = false;
    try {
      const notificationEmail = process.env.PRAXORA_NOTIFICATION_EMAIL;
      if (!notificationEmail) throw new Error('Notification email is missing.');
      await sendEmail({ to: notificationEmail, subject: 'New Praxora Follow-Up Leak Review Request', text: founderNotification(review) });
      await sendEmail({ to: email, subject: 'Your Praxora follow-up leak review request', text: requesterConfirmation(review) });
      emailSent = true;
    } catch (emailError) {
      console.error('Leak review email failed', emailError);
    }
    return sendJson(res, 200, { success: true, email_sent: emailSent });
  } catch (error) {
    console.error('Leak review failed', error);
    return sendJson(res, 500, { success: false, error: 'Unable to process your request.' });
  }
};

