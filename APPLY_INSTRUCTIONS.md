# Apply Instructions — SEO Cumulative Fixed Package

This package is cumulative and replaces the earlier SEO Sprint 1, 2, and 3 patch files.

It includes:

- Sprint 1 problem SEO pages
- Sprint 2 category-comparison pages
- Sprint 3 competitor-interception pages
- SEO article template fixes
- Medium-desktop header overflow fix
- `/resources/` discovery hub
- Updated cumulative sitemap
- Current shared `styles.css` plus scoped article styles

## Copy into the repository using the same paths

You can copy the package contents over the repository root.

The package only contains files that are intended to be replaced or added:

- `styles.css`
- `sitemap.xml`
- `missed-calls.html`
- `workflow-unscheduled-treatment.html`
- `workflow-recall-leakage.html`
- `resources/`

Do **not** delete or replace unrelated repository files such as:

- `index.html`
- `script.js`
- `api/`
- `dental-revenue-leak-calculator/`
- `follow-up-recovery-kit/`
- `privacy/`
- `docs/`
- `.env.example`
- Vercel/Supabase/Resend configuration

## What the display fix changes

- Article hero is more compact.
- Long article H1s no longer dominate the whole viewport.
- Article H2s use article-sized typography rather than landing-page typography.
- Article sections no longer render as a stack of giant glass cards.
- The entire article body is no longer hidden behind one `reveal` animation.
- Every article has an `On this page` navigation block.
- Sprint 2 and Sprint 3 comparison pages have an `at a glance` comparison block.
- Navigation collapses to the Menu layout at 1280px to prevent the right CTA from clipping.
- The homepage and Calculator are not restyled by these article-specific CSS rules.

## What the discovery fix changes

- Adds `/resources/` as a crawlable resource hub.
- The hub links to all Sprint 1, 2, and 3 SEO pages.
- Article navigation now points `Resources` to `/resources/`.
- `sitemap.xml` includes `/resources/`.

## After deployment

1. Open `/resources/`.
2. Open `/resources/missed-call-text-back-vs-recovery/`.
3. Verify the first screen no longer consists almost entirely of the giant H1.
4. Scroll: article text should be visible immediately without waiting for an article-level reveal.
5. Test at approximately 1100–1250px browser width: the header should use the Menu layout and the `Free Leak Review` CTA should not clip.
6. Test mobile width.
7. Open `/sitemap.xml` and search for `/resources/`.
8. Re-submit the same sitemap in Google Search Console after deployment.

No Calculator, API, Supabase, Resend, GA, UTM, or email logic is changed by this package.
