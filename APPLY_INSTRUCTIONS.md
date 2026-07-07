# Praxora SEO Final Overwrite Package

This is the final cumulative SEO overwrite package for Sprint 1 + Sprint 2 + Sprint 3, including the article-template fixes and final header cleanup.

## Final header fixes

- Uses `/assets/praxora-icon.png` in the square brand image slot.
- Keeps the HTML `Praxora.ai` wordmark text beside the icon.
- Removes the duplicate `Free Leak Review` link from the main desktop navigation.
- Keeps the standalone white `Free Leak Review` CTA.
- Restores full desktop brand, navigation, and CTA typography.
- At 1041–1320px, only spacing is tightened.
- The `Menu` control remains limited to the existing `<=1040px` breakpoint.

Expected desktop header:

`[P icon] Praxora.ai    How It Works    Calculator    Resources                 [Free Leak Review]`

## Apply

Copy the contents of this ZIP into the repository root and replace matching files.

This package intentionally changes only:

- `styles.css`
- `sitemap.xml`
- `missed-calls.html`
- `workflow-unscheduled-treatment.html`
- `workflow-recall-leakage.html`
- `resources/**`

It does not modify:

- `index.html`
- `script.js`
- `api/`
- Calculator logic
- Google Analytics
- UTM logic
- Supabase
- Resend or email logic

## After deployment

Open:

1. `/resources/missed-call-text-back-vs-recovery/`
2. `/resources/maxassist-alternatives-dental-follow-up/`
3. `/resources/`
4. `/workflow-unscheduled-treatment.html`

At desktop width, confirm the full navigation is visible and there is only one `Free Leak Review` label in the header.

At <=1040px, confirm the Menu button appears and opens the navigation.
