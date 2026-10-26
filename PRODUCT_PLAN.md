# Dictationer: beta product decisions

## Product promise
Capture an idea when it happens, return to it on any device, and turn a growing body of original material into a finished English or Hindi book. Preserve original recordings and author intent. Never silently replace a manuscript with generated text.

## Web first, native when justified
Start with a responsive, installable web entry point. Use a large, thumb-friendly capture button on phones and a full writing/design desk on laptops. Native Android becomes the next investment if repeat authors need background recording, lock-screen shortcuts, offline transcription, or stronger recording recovery. An installable website is not equivalent to guaranteed background or offline audio capture.

Statcounter's retrieved August 2026 India snapshot: mobile 64.45%, desktop 34.97%, tablet 0.58%. This measures observed web traffic, not the fraction of individual Indians owning or using each device; desktop includes laptops. Do not extrapolate these percentages to authors. Measure this product's device mix separately.
Source: https://gs.statcounter.com/platform-market-share/mobile-desktop-tablet/india

## Implemented beta
- Existing artistic writing workspace retained, with isolated capture styles and clearer input alignment.
- Laps and quick-capture microphones outside text boxes; full-width editable text.
- Summary parts remain in place; insert after any card; folding controls remain visible.
- Character folding; shared spoken/typed input layout improvements.
- Authenticated, owner-scoped cloud records in D1 and audio/media in R2. Guest writing remains browser-local. Sign-in does not automatically migrate guest data: export in guest Settings and import after sign-in.
- Original-words idea assembly into a reviewed new chapter. This is not AI rewriting.
- Cover generation button locks during work. Template-based cover runs preserve timestamp, input context, results and costs. Successful images persist to cloud storage for signed-in authors.
- Multi-size/style book previews, saved editions, PDF print-window and EPUB export. Free-writing manuscript now participates in preview generation; previously an author could have words but no eligible chapters.
- Failed preview outputs return their beta test credits; failed exports return credits. Free beta credits are not money, and demo top-ups are deliberately not a payment integration.
- Audience and target-page fields, manual design controls, rules-based suggested settings. Target pages are a planning goal, not a guarantee or invitation to insert filler.
- Protected founder dashboard with browser-unique visitors, pricing views, buy clickers, email registrations, device breakdown, daily chart and CSV export. Starts empty; no fabricated data.
- Proposed ₹499/month beta interest test. Clicking Buy beta opens an explicitly non-payment sign-up. Price, included limits and separate generation/export pricing are not finalized.

## Validation sequence
Recruit 20 real authors across English/Hindi and fiction/nonfiction. Observe the first capture and first chapter. Follow up after 7 and 14 days. Measure return use, repeated captures, ideas used in chapters and completed exports. Ask why people abandon capture, preview or pricing. Track buy-click rate against unique pricing viewers; use an actual checkout later to validate payment conversion. A small sample is directional, not statistical proof.

## Launch dependencies and limits
1. Configure an authorized server-side AI provider credential before implementing/enabling real AI rewriting and AI artwork. The current cover engine uses preset illustration rules. No provider call is currently made.
2. Author review should precede AI outline acceptance, chapter expansion and manuscript replacement. Store source idea IDs, model, prompt version, cost and revision history. Generate a book chapter-by-chapter, not a single fragile whole-book request.
3. Add a real payment provider, verified webhooks, idempotent transactions, refunds and a server-owned paid-credit ledger before charging money. Existing credit top-ups are beta simulation only.
4. The initial deployment is owner-private for review. Public audience must be enabled before external acquisition testing. Founder test traffic is excluded in the client. Public analytics needs stronger abuse filtering before large campaigns.
5. Browser speech recognition availability varies. Recording while the phone is locked/backgrounded is not guaranteed. Current transcription is browser-provided; no server transcription, offline audio queue or native background service exists.
6. Cloud storage supports switching devices and refresh-on-focus, not real-time collaborative editing. Concurrent same-field writes remain last-write-wins; version history protects chapter text, but a conflict UI is needed before coauthoring.
7. Audio retention is enforced when audio endpoints are accessed; a scheduled purge is needed for strict background deletion guarantees.
8. A marketing-first server-rendered landing page, full Hindi translation of new beta panels, real-device mic tests and printer-specific PDF preflight should precede a broad commercial launch.

## Verification
Production compilation and TypeScript checks. Automated tests cover user isolation, CRUD, Hindi content, chapter restore history, origin checking, atomic credit exhaustion, deletion, unauthenticated access and analytics deduplication. Browser visual QA, microphone hardware, actual download dialogs, hosted AI and payment processing are not verified in this environment. Private deployment is a reviewable beta, not a claim of commercial production readiness.
