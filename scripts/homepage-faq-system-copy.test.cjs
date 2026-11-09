const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workflow = fs.readFileSync(path.join(root, 'workflow-unscheduled-treatment.html'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'resources/open-dental-unscheduled-treatment-report/index.html'), 'utf8');

const question = 'How do I run an unscheduled treatment report in Open Dental?';
const answer = 'See our step-by-step guide to running an unscheduled treatment report in Open Dental. Once you have the report, the next step is assigning follow-up owners and tracking appointment outcomes.';
const systemCopy = 'Using Open Dental, Dentrix, or another practice management system? Explore our follow-up workflow guides.';
const guideHref = '/resources/open-dental-unscheduled-treatment-report/';
const guidesHref = '/resources/';

function visibleText(html, pattern) {
  const match = html.match(pattern);
  assert.ok(match, pattern);
  return match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

test('homepage FAQ question, answer, and structured data stay aligned', () => {
  const visible = [...home.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)];
  const item = visible.find((match) => match[1] === question);
  assert.ok(item, 'visible FAQ item');
  assert.equal(visible.filter((match) => match[1] === question).length, 1);
  assert.equal(item[2].replace(/<[^>]+>/g, ''), answer);
  assert.match(item[2], new RegExp(`<a href="${guideHref}">step-by-step guide</a>`));

  const schema = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = schema['@graph'].find((node) => node['@type'] === 'FAQPage');
  const structured = faq.mainEntity.filter((node) => node.name === question);
  assert.equal(structured.length, 1);
  assert.equal(structured[0].acceptedAnswer.text, answer);
  assert.equal(home.match(/<h1>([\s\S]*?)<\/h1>/)[1].replace(/<br>/g, ' ').replace(/\s+/g, ' ').trim(), 'Recover unscheduled treatment before it goes cold.');
});

test('system note points at existing guides and does not claim a standalone workflow', () => {
  for (const html of [home, workflow]) {
    assert.equal(visibleText(html, /<p>(Using Open Dental, Dentrix, or another practice management system\?.*?)<\/p>/), systemCopy);
    assert.match(html, new RegExp(`<a href="${guidesHref}">follow-up workflow guides</a>`));
    assert.equal(html.includes('Start with a standalone follow-up workflow'), false);
    assert.equal(html.includes('Optimized for'), false);
    assert.equal(html.includes('Compatible with UK'), false);
  }
  assert.match(guide, /Standard Reports → Lists → Treatment Finder/);
  assert.match(guide, /<h1>How to pull the Open Dental unscheduled treatment report<\/h1>/);
  assert.equal(fs.existsSync(path.join(root, 'resources/index.html')), true);
});
