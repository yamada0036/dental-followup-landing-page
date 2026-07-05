# Praxora Email Sequence Plan

Email 1 is implemented server-side through `/api/lead` and is sent immediately after a successful Calculator lead submission when Resend is configured.

Planned education sequence:

- Email 1: immediate - Your follow-up leakage breakdown
- Email 2: Day 2 - Missed Call Recovery
- Email 3: Day 4 - Unscheduled Treatment Follow-Up
- Email 4: Day 7 - Overdue Recall Recovery
- Email 5: Day 10 - Free Follow-Up Leak Review

Emails 2-5 are not scheduled in this repository. Recommended V1 integration: use Resend Broadcasts, Customer.io, Loops, ConvertKit, or another email automation tool triggered from new rows in Supabase `leads` where `source = 'revenue_leak_calculator'`.

Do not simulate delayed delivery in browser JavaScript. Mark Emails 2-5 live only after they are configured in a real server-side or provider-side automation.
