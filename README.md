# Praxora

Praxora is positioned as **AI Follow-Up Recovery for Dental Practices**.

The core problem is **Follow-Up Leakage**: patient opportunities falling out of the normal follow-up process without a clear next action, owner, or tracked outcome.

Core workflows:

- Missed Calls
- Unscheduled Treatment
- Overdue Recall

Primary funnel:

```text
Revenue Leak Calculator
-> Recovery Breakdown
-> Recovery Kit
-> Free Follow-Up Leak Review
```

## Architecture

The site remains a static HTML/CSS/vanilla JavaScript website deployed on Vercel.

Production URL: **https://www.getpraxora.com**.

All page canonicals, social metadata, JSON-LD identifiers, sitemap entries, and
transactional Recovery Kit email links use this primary domain. `vercel.json`
permanently redirects the old production Vercel hostname and `getpraxora.com`
to the primary domain while retaining page paths and query parameters. The same
file also permanently redirects extensionless aliases of the root HTML pages
(and `/index.html`) to the canonical `www` URLs before those host catch-alls.
Preview deployment hostnames are not matched by those domain rules.

GitHub Pages publishes this same branch, but it cannot emit HTTP 301 or 308.
`_config.yml` is a Pages-only Jekyll build that publishes
`_canonical_redirects/` as instant meta-refresh and `location.replace` pages
pointing at the same `www` URLs. `vercel.json` sets `"framework": null` so
Vercel keeps deploying the static HTML instead of that Jekyll output.

Keep both custom domains assigned to this Vercel project with working DNS and
HTTPS. The Vercel domain setting should redirect the apex to `www`, never the
reverse. Domain registration alone does not configure hosting.

After deployment, verify the new Google Search Console property and submit
`https://www.getpraxora.com/sitemap.xml`. Keep the existing Google verification
file. Review the GA4 web stream's website URL and any external campaign links.
Email sender addresses are configured separately via `PRAXORA_FROM_EMAIL`; a
website domain migration does not automatically verify a new Resend sender.

Run the local SEO validation with `python3 scripts/check_seo.py`.

P0 conversion endpoints live in `api/` as Vercel Serverless Functions:

- `POST /api/lead` accepts Calculator leads and sends Email 1.
- `POST /api/leak-review` accepts Free Follow-Up Leak Review requests and sends notification/confirmation emails.
- `GET /api/config` exposes non-secret frontend config such as the GA measurement ID.

Supabase storage is optional. Email delivery uses Resend through server-side environment variables. With no Supabase variables, or when those variables are set but a Supabase call fails, both routes still accept a validated submission, skip the database write, and attempt email when Resend is configured.

## Environment Variables

Trimmed values are used; do not wrap them in quotes. None of the Supabase variables are required for the forms to return success.

Optional storage. Set both, or neither. A partial pair is treated as unset. When unset, or when a configured project cannot be reached, rejects the key, is missing the table, or has a bad URL, no row is written and the response does not pretend one was stored.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_URL` is the project URL (`https://<project>.supabase.co`), not the REST path. `SUPABASE_SERVICE_ROLE_KEY` must be the service role key. The anon key cannot insert past row level security. That failure is logged, the row is skipped, and a validated submission still returns success, the same as when storage is unset.

Email delivery uses Resend. These are the variables still required for founder and requester mail. A validated submission still returns success when email fails; the UI then says the confirmation email was not sent.

```text
RESEND_API_KEY
PRAXORA_FROM_EMAIL
PRAXORA_NOTIFICATION_EMAIL
```

`RESEND_API_KEY` and `PRAXORA_FROM_EMAIL` are required for every send. `PRAXORA_FROM_EMAIL` must be a verified Resend sender. `PRAXORA_NOTIFICATION_EMAIL` is the founder inbox for new review requests. The calculator breakdown email does not use the notification address. The leak-review route sends the founder notice only when that address is set, and still sends the requester confirmation when Resend itself is configured.

```text
PRAXORA_GA_MEASUREMENT_ID
RATE_LIMIT_SALT
```

`SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` must only be configured in Vercel environment variables. Do not expose them in frontend JavaScript.

`RATE_LIMIT_SALT` should be a long random string. It salts hashed client addresses for the 5-request / 10-minute limit. If it is unset and the service role key is present, that key is used as the salt. If Supabase is not configured and the salt is also unset, hashes use a built-in pepper so a missing secret does not reject the form. That pepper is not a deploy secret. Without Supabase, the limit is kept in memory on that instance only.

`POST /api/leak-review` and `POST /api/lead` return success after validation even when Supabase is unset, Supabase calls fail, and email cannot be sent. That case is logged as accepted in-process only. The audit form fires GA4 `generate_lead` when the response is HTTP 200 and `success` is true.

### Verify a deploy with no working Supabase

The same checks apply when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are still set but Supabase is not usable. Invalid JSON is 400. A valid review is 200 with `"success": true`.

```bash
# Invalid JSON must be 400, not 500.
curl -i -X POST 'https://www.getpraxora.com/api/leak-review' \
  -H 'Content-Type: application/json' --data 'not-json'

# Valid non-PHI review. Expect 200 and "success": true.
# founder_email_sent / requester_email_sent are true only when Resend is configured.
curl -i -X POST 'https://www.getpraxora.com/api/leak-review' \
  -H 'Content-Type: application/json' \
  --data '{"name":"Test Reviewer","email":"leak-review-test@example.com","practice_name":"Example Dental","number_of_locations":2,"pms":"Open Dental","missed_call_process":"Front desk calls back the same day.","unscheduled_treatment_process":"A list is printed weekly.","overdue_recall_process":"Postcards go out monthly.","most_frustrating_workflow":"Missed call follow-up.","company_website":""}'
```

## Database Setup

Run `docs/supabase-schema.sql` for a fresh setup, or `docs/p0-p1-migration.sql` to update an existing Supabase project, before expecting rows to be stored. The review insert does not send `founder_email_status` or `requester_email_status`; those columns keep their defaults and are updated after email delivery. An older `leak_reviews` table that does not have them can still store the request. `submission_rate_limits` is required for a rate limit shared across serverless instances. If Supabase is unset, a Supabase call fails, or that table is missing, the function keeps the same 5-request / 10-minute limit in memory on that instance. A missing table is logged with a reminder to apply the migration. The honeypot field is unchanged.

Tables:

- `leads` for Revenue Leak Calculator submissions
- `leak_reviews` for Free Follow-Up Leak Review requests

No patient-level data should be collected.

## Email Setup

Resend must be configured with:

- `RESEND_API_KEY`
- `PRAXORA_FROM_EMAIL`
- `PRAXORA_NOTIFICATION_EMAIL`

Verify the sender domain in Resend before claiming production email delivery is live.

Email 1 is implemented immediately after Calculator submission. Emails 2-5 are NOT LIVE, documented in `docs/email-sequence.md`, and should be configured in a real email automation provider before being described as live. A real unsubscribe mechanism is required before activating marketing automation.

## Analytics Setup

Set `PRAXORA_GA_MEASUREMENT_ID` to a GA4 measurement ID such as `G-XXXXXXXXXX`. `RATE_LIMIT_SALT` is optional; see above.

Frontend events are sent through `trackEvent()` after `gtag.js` is loaded from `/api/config`. Do not send names, emails, practice names, or raw form text to Google Analytics.

Production analytics only runs on `www.getpraxora.com`. `/api/config` returns the
measurement ID only when the request host is the canonical hostname.
Preview deployment hostnames and localhost do not
send events to the production property. Early events are queued until configuration
loads; disabled analytics or unavailable session storage must not break the forms.

Both lead forms emit the GA4 recommended `generate_lead` event only after a
successful API response. `lead_source` and `form_name` identify the form:
`leak_review` / `free_missed_revenue_audit` for the free missed-revenue audit,
and `revenue_leak_calculator` for the calculator email. Event parameters do not
include names, emails, or practice names. An accepted submission counts
even when Supabase is unset and the confirmation email fails. The API returns
`success: true` after validation in that case and logs that the lead was
accepted in-process only. The UI separately reports email status.

`form_start` in GA4 is enhanced measurement for the first form interaction.
`form_submit` is a reserved enhanced-measurement name and is not sent from the
site. These forms call `preventDefault()` and submit with `fetch`, so enhanced
measurement does not record a successful submit. Mark `generate_lead` as the
lead key event. Do not also mark `form_start`, `leak_review_submit`, or
`calculator_email_submit`.

Showing a calculator estimate emits `calculator_complete` once, alongside the
existing `calculator_result_view` event. Mark `calculator_complete` as the
calculator key event. Do not mark `calculator_view`, `calculator_start`, or
`calculator_result_view`. Register `lead_source`, `form_name`, and
`largest_leak` as event-scoped custom dimensions if you need to break results
down. This code does not change the measurement ID, GA4 property settings, or
historical events.

Run analytics regression checks with `node --test scripts/analytics.test.cjs scripts/conversion-events.test.cjs scripts/leak-review.test.cjs`.
After deploying, verify one real successful submission in GA4 DebugView.
Confirm email delivery from Resend, and confirm a stored row only when the
Supabase write succeeds. Local tests use mocked services and do not establish
production database or email health.

## Important Files

- `index.html` - homepage
- `dental-revenue-leak-calculator/` - Revenue Leak Calculator
- `follow-up-recovery-kit/` - web-based Recovery Kit
- `free-missed-revenue-audit.html` - Free Follow-Up Leak Review form
- `resources/follow-up-leakage-dental-practice/` - pillar page
- `api/` - Vercel Serverless Functions
- `docs/supabase-schema.sql` - database schema
- `docs/email-sequence.md` - education sequence plan

Do not restore `.nojekyll`. GitHub Pages must keep running the Jekyll redirect build. Do not delete `googlea050d084b5f189f3.html`, `robots.txt`, `sitemap.xml`, `_config.yml`, `_canonical_redirects/`, or `assets/`.


