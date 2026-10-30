'use strict';

// Progressive enhancement: messages and the download remain available without JavaScript.
document.querySelectorAll('[data-copy-template]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const id = button.dataset.copyTemplate;
    const message = document.getElementById(id);
    const status = document.querySelector('[data-status-for="' + id + '"]');
    if (!message || !status) return;
    try {
      await navigator.clipboard.writeText(message.textContent.trim());
      status.textContent = 'Copied. Review and personalize before sending.';
    } catch {
      status.textContent = 'Copy is unavailable. Select the message above to copy it, or download all five samples.';
    }
  });
});
