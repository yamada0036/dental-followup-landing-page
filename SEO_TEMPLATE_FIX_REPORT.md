# Praxora SEO Article Template & Discovery Fix

## Why this patch exists

The Sprint 2 and Sprint 3 pages had full article content in the HTML, but the shared landing-page template made several long-form SEO pages look like short landing pages:

- `.page-hero h1` could grow to 88px.
- `.page-hero` used large vertical padding.
- global `h2` styles were sized for landing-page sections.
- every `.content-block` was a large glass card.
- the whole `<article>` used the `reveal` class.
- the navigation only collapsed at 1040px, which could crowd the header at medium desktop widths.

## Fixed

### Article layout

All 11 Sprint 1/2/3 SEO articles now use:

`<body class="article-page">`

The article body no longer has the `reveal` class.

Scoped article CSS now provides:

- compact hero
- 40–68px desktop H1
- 36–54px mobile H1
- readable 30–48px H2
- 860px article width
- 78-character paragraph measure
- normal editorial sections separated by subtle rules
- no giant glass-card stack

### Comparison clarity

All seven Sprint 2 and Sprint 3 comparison/interception pages now start with a two-column `Comparison at a glance` block.

This fixes the perception that the page contains only a hero and one paragraph and makes the comparison intent visible before the long article.

### Article navigation

All 11 articles now include an `On this page` block generated from the page's H2 structure.

### Header responsiveness

The compact Menu navigation begins at 1280px instead of waiting until 1040px. This addresses the clipped `Free Leak Review` CTA visible at medium desktop widths.

### Resource discovery

A new `/resources/` hub links to:

- Follow-Up Leakage pillar
- Missed Call Recovery
- Unscheduled Treatment Follow-Up
- Recall Recovery
- AI Dental Receptionist vs Follow-Up Recovery
- Missed Call Text-Back vs Recovery
- Dental Recall Software vs Recovery
- MaxAssist Alternatives
- RecallMax Alternatives
- Weave vs Follow-Up Recovery
- Dental Intelligence vs Follow-Up Recovery

The sitemap includes the new hub.

## Preserved

- URLs
- primary SEO intent
- title and description strategy
- canonicals
- `index, follow`
- Sprint 1/2/3 core article copy
- Calculator CTAs
- Free Leak Review CTAs
- competitor claim guardrails
- no fake case studies or revenue proof

## Not changed

- Homepage visual system
- Calculator
- Calculator formulas
- API
- Supabase
- Resend
- GA
- UTM persistence
- Email logic
