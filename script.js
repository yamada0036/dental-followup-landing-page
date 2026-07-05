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

function trackEvent(eventName, parameters = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, parameters);
    return;
  }
  console.info('[analytics]', eventName, parameters);
}

async function submitLead(payload) {
  const endpoint = window.PRAXORA_LEAD_ENDPOINT;
  if (!endpoint) {
    console.info('Lead payload:', payload);
    throw new Error('Lead endpoint is not configured.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Lead submission failed.');
  }
  return response.json().catch(() => ({}));
}

function bindLeadForms() {
  document.querySelectorAll('[data-lead-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('[data-form-status]');
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.source = form.dataset.source || 'website_form';
      payload.created_at = new Date().toISOString();
      form.querySelectorAll('.error-message').forEach((el) => { el.textContent = ''; });

      let valid = true;
      form.querySelectorAll('[required]').forEach((field) => {
        if (!String(field.value || '').trim()) {
          valid = false;
          const error = form.querySelector(`[data-error-for="${field.id}"]`);
          if (error) error.textContent = 'Please complete this field.';
        }
      });
      const email = form.querySelector('input[type="email"]');
      if (email && email.value && !email.validity.valid) {
        valid = false;
        const error = form.querySelector(`[data-error-for="${email.id}"]`);
        if (error) error.textContent = 'Please enter a valid work email.';
      }
      if (!valid) return;

      try {
        if (status) { status.textContent = 'Submitting...'; status.classList.remove('error'); }
        trackEvent(form.dataset.event || 'lead_form_submit', { source: payload.source });
        await submitLead(payload);
        if (status) status.textContent = 'Request received.';
      } catch (error) {
        if (status) {
          status.textContent = 'Email delivery is not configured yet.';
          status.classList.add('error');
        }
        trackEvent('lead_form_submit_error', { source: payload.source, message: error.message });
      }
    });
  });
}

bindLeadForms();

document.querySelectorAll('[data-track]').forEach((node) => {
  node.addEventListener('click', () => trackEvent(node.dataset.track, { href: node.getAttribute('href') || '' }));
});
