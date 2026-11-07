'use strict';

document.querySelectorAll('[data-waitlist-form]').forEach((form) => {
  const status = form.querySelector('[data-waitlist-status]');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    status.classList.remove('error');
    button.disabled = true;
    status.textContent = 'Joining the waitlist…';
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.consent = form.querySelector('[name="consent"]').checked;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      payload[key] = new URLSearchParams(location.search).get(key) || '';
    }
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Submission failed.');
      form.reset();
      status.textContent = 'You are on the early-access waitlist. Thanks for your interest.';
    } catch (error) {
      status.textContent = error.message || 'Unable to join right now. Please try again later.';
      status.classList.add('error');
    } finally {
      button.disabled = false;
    }
  });
});
