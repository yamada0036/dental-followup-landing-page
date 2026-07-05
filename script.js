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

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
}

const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

function persistUtmParameters() {
  const params = new URLSearchParams(window.location.search);
  utmKeys.forEach((key) => {
    const value = params.get(key);
    if (value) sessionStorage.setItem(`praxora_${key}`, value.slice(0, 120));
  });
}

function getStoredUtmParameters() {
  return utmKeys.reduce((values, key) => {
    values[key] = sessionStorage.getItem(`praxora_${key}`) || '';
    return values;
  }, {});
}

persistUtmParameters();
window.PraxoraUtm = { persist: persistUtmParameters, get: getStoredUtmParameters };

function trackEvent(eventName, parameters = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, parameters);
    return;
  }
  console.info('[analytics]', eventName, parameters);
}
window.trackEvent = trackEvent;

async function loadAnalytics() {
  if (typeof window.gtag === 'function') return;
  try {
    const response = await fetch('/api/config');
    if (!response.ok) return;
    const config = await response.json();
    const measurementId = config.gaMeasurementId;
    if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(){ window.dataLayer.push(arguments); };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: true });
  } catch (error) {
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


