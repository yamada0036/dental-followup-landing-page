'use strict';

const pilotForm = document.querySelector('[data-pilot-form]');
if (pilotForm) {
  const status = pilotForm.querySelector('[data-pilot-status]');
  const submit = pilotForm.querySelector('button[type="submit"]');
  pilotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pilotForm.reportValidity()) return;
    status.classList.remove('error');
    status.textContent = 'Submitting your application…';
    submit.disabled = true;
    const payload = Object.fromEntries(new FormData(pilotForm).entries());
    payload.consent = pilotForm.querySelector('[name="consent"]').checked;
    const params = new URLSearchParams(location.search);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      payload[key] = params.get(key) || '';
    }
    try {
      const response = await fetch('/api/pilot-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to submit right now.');
      pilotForm.reset();
      status.textContent = 'Application received. We will contact you to learn about your practice workflow.';
    } catch (error) {
      status.textContent = error.message || 'Unable to submit right now. Please try again later.';
      status.classList.add('error');
    } finally {
      submit.disabled = false;
    }
  });
}
