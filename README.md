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
to the primary domain while retaining page paths and query parameters. Preview
deployment hostnames are not matched by those domain rules.

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

- `POST /api/lead` stores Calculator leads and sends Email 1.
- `POST /api/leak-review` stores Free Follow-Up Leak Review requests and sends notification/confirmation emails.
- `GET /api/config` exposes non-secret frontend config such as the GA measurement ID.

Lead storage uses Supabase through server-side environment variables. Email delivery uses Resend through server-side environment variables.

## Required Environment Variables

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY
PRAXORA_FROM_EMAIL
PRAXORA_NOTIFICATION_EMAIL

PRAXORA_GA_MEASUREMENT_ID
RATE_LIMIT_SALT
```

`SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` must only be configured in Vercel environment variables. Do not expose them in frontend JavaScript.

## Database Setup

Run `docs/supabase-schema.sql` for a fresh setup, or `docs/p0-p1-migration.sql` to update an existing Supabase project, before routing production traffic.

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

Set `PRAXORA_GA_MEASUREMENT_ID` to a GA4 measurement ID such as `G-XXXXXXXXXX`. Set `RATE_LIMIT_SALT` to a long random string for hashed rate limiting.

Frontend events are sent through `trackEvent()` after `gtag.js` is loaded from `/api/config`. Do not send names, emails, practice names, or raw form text to Google Analytics.

## Important Files

- `index.html` - homepage
- `dental-revenue-leak-calculator/` - Revenue Leak Calculator
- `follow-up-recovery-kit/` - web-based Recovery Kit
- `free-missed-revenue-audit.html` - Free Follow-Up Leak Review form
- `resources/follow-up-leakage-dental-practice/` - pillar page
- `api/` - Vercel Serverless Functions
- `docs/supabase-schema.sql` - database schema
- `docs/email-sequence.md` - education sequence plan

Do not delete `.nojekyll`, `googlea050d084b5f189f3.html`, `robots.txt`, `sitemap.xml`, or `assets/`.


