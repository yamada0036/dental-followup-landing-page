# Dental Follow-Up Recovery Landing Page

Static GitHub Pages site for Praxora.ai, an AI revenue recovery landing page for dental practices.

## Files

- `index.html` — main Praxora landing page with SEO metadata and LinkedIn preview tags
- `free-missed-revenue-audit.html` — free missed revenue audit conversion page
- `workflow-missed-implant-consult.html` — example workflow teardown page for missed implant consults
- `workflow-recall-leakage.html` — example workflow teardown page for recall leakage
- `workflow-unscheduled-treatment.html` — example workflow teardown page for unscheduled treatment follow-up
- `missed-calls.html` — existing SEO article page
- `og-image.png` — LinkedIn/Twitter preview image
- `assets/` — logo and visual assets
- `styles.css` — shared site styles
- `script.js` — header scroll and reveal animations
- `robots.txt` — crawler instructions
- `sitemap.xml` — sitemap for Google Search Console

## Deployment

Upload all files to the root of the existing GitHub repository:

`yamada0036/dental-followup-landing-page`

GitHub Pages should remain configured as:

- Source: Deploy from a branch
- Branch: main
- Folder: / root

After committing the updated files, GitHub Pages will redeploy automatically.

Live URL:

https://dental-followup-landing-page.vercel.app/

## Important edits before publishing seriously

Replace every Tally placeholder link:

`https://tally.so/r/YOUR_FORM_ID`

with your real Tally, Calendly, Formspree, or contact form link.

Do not delete:

- `.nojekyll`
- Google Search Console verification file
- `robots.txt`
- existing `assets/` folder
- existing `og-image.png`
