# Praxora Email Sequence Plan

Current status:

- Email 1: LIVE - immediate transactional Recovery Breakdown from `/api/lead` when Resend is configured.
- Email 2: NOT LIVE - Day 2 Missed Call Recovery.
- Email 3: NOT LIVE - Day 4 Unscheduled Treatment Follow-Up.
- Email 4: NOT LIVE - Day 7 Overdue Recall Recovery.
- Email 5: NOT LIVE - Day 10 Free Follow-Up Leak Review.

Planned schedule:

- Email 1: immediate - Your follow-up leakage breakdown
- Email 2: Day 2 - Missed Call Recovery
- Email 3: Day 4 - Unscheduled Treatment Follow-Up
- Email 4: Day 7 - Overdue Recall Recovery
- Email 5: Day 10 - Free Follow-Up Leak Review

Server-side handoff point:

`api/lead.js` includes `enrollLeadInRecoverySequence()`. It currently returns `{ enrolled: false, reason: "provider_not_configured" }` and stores `sequence_status = "not_enrolled"`.

Emails 2-5 must remain marked NOT LIVE until a real automation provider confirms enrollment and scheduled delivery. Recommended future integration: Resend Broadcasts, Customer.io, Loops, ConvertKit, or another provider triggered from stored Supabase leads.

Do not simulate delayed delivery with browser timers, `setTimeout`, or sleeping Vercel functions.

Activation blocker:

A future marketing automation provider must support or supply a real unsubscribe mechanism before Emails 2-5 are activated.
