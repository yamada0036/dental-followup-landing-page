const header = document.getElementById('siteHeader');

if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.getElementById('mainNav');
if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mainNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    mainNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));
}

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((el) => {
    if (el.getBoundingClientRect().top >= window.innerHeight && !el.matches('.hero-content, .page-hero-content, .content-wrap')) {
      observer.observe(el);
      el.classList.add('reveal-pending');
    }
  });
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
}

const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
const currentUtm = {};

function persistUtmParameters() {
  const params = new URLSearchParams(window.location.search);
  utmKeys.forEach((key) => {
    const value = params.get(key);
    if (value) {
      currentUtm[key] = value.slice(0, 120);
      try { sessionStorage.setItem(`praxora_${key}`, currentUtm[key]); } catch (_) { /* Storage can be disabled. */ }
    }
  });
}

function getStoredUtmParameters() {
  return utmKeys.reduce((values, key) => {
    values[key] = currentUtm[key] || '';
    try { values[key] = values[key] || sessionStorage.getItem(`praxora_${key}`) || ''; } catch (_) { /* Keep the current-page attribution. */ }
    return values;
  }, {});
}

persistUtmParameters();
window.PraxoraUtm = { persist: persistUtmParameters, get: getStoredUtmParameters };

// Only the canonical production site contributes to the production GA4 property.
const productionAnalytics = window.location.hostname === 'www.getpraxora.com';
let analyticsState = productionAnalytics ? 'pending' : 'disabled';
const pendingEvents = [];

function trackEvent(eventName, parameters = {}) {
  if (analyticsState === 'disabled') return;
  if (analyticsState === 'ready' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, parameters);
    return;
  }
  // Views and early interactions may happen before /api/config resolves.
  if (pendingEvents.length < 100) pendingEvents.push([eventName, { ...parameters }]);
}
window.trackEvent = trackEvent;

async function loadAnalytics() {
  if (!productionAnalytics) return;
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Analytics configuration unavailable.');
    const config = await response.json();
    const measurementId = config.gaMeasurementId;
    if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) throw new Error('Analytics is not configured.');

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(){ window.dataLayer.push(arguments); };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: true });
    analyticsState = 'ready';
    pendingEvents.splice(0).forEach(([name, parameters]) => trackEvent(name, parameters));
  } catch (error) {
    analyticsState = 'disabled';
    pendingEvents.length = 0;
    console.info('[analytics_config]', error.message);
  }
}

loadAnalytics();

function setFieldError(form, fieldId, message = '') {
  const error = form.querySelector(`[data-error-for="${fieldId}"]`);
  if (error) error.textContent = message;
}

function clearFormErrors(form) {
  form.querySelectorAll('.error-message').forEach((node) => { node.textContent = ''; });
}

function formPayload(form) {
  return { ...Object.fromEntries(new FormData(form).entries()), ...getStoredUtmParameters() };
}

function bindLeakReviewForm() {
  const form = document.querySelector('[data-leak-review-form]');
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-form-status]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    status.textContent = '';
    status.className = 'status-message';

    let valid = true;
    ['review_name', 'review_email', 'review_practice'].forEach((id) => {
      const field = document.getElementById(id);
      if (!field || !field.value.trim()) {
        setFieldError(form, id, 'Please complete this field.');
        valid = false;
      }
    });
    const email = document.getElementById('review_email');
    if (email && email.value && !email.validity.valid) {
      setFieldError(form, 'review_email', 'Please enter a valid work email.');
      valid = false;
    }
    if (!valid) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Submitting Your Review Request...';
    status.textContent = 'Submitting your request...';
    trackEvent('leak_review_submit', getStoredUtmParameters());

    try {
      const response = await fetch('/api/leak-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPayload(form))
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error('Submission failed.');
      form.hidden = true;
      const success = document.getElementById('leakReviewSuccess');
      if (success) {
        success.hidden = false;
        const emailNotice = success.querySelector('[data-requester-email-status]');
        if (emailNotice && result.requester_email_sent === false) {
          emailNotice.hidden = false;
        }
      }
      trackEvent('leak_review_submit_success', getStoredUtmParameters());
      trackEvent('generate_lead', { lead_source: 'leak_review', ...getStoredUtmParameters() });
    } catch (error) {
      status.innerHTML = '<strong>We could not submit your review request right now.</strong><br>Please try again.';
      status.classList.add('error');
      button.disabled = false;
      button.textContent = originalText;
      trackEvent('leak_review_submit_error', getStoredUtmParameters());
    }
  });
}

bindLeakReviewForm();

document.querySelectorAll('[data-track]').forEach((node) => {
  node.addEventListener('click', () => trackEvent(node.dataset.track, getStoredUtmParameters()));
});

if (document.body.dataset.page === 'recovery-kit') {
  trackEvent('recovery_kit_view', getStoredUtmParameters());
}


