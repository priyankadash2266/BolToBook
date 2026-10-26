# BolToBook

Voice-first English/Hindi book-writing studio. Next.js on Vercel; Supabase Auth, PostgreSQL and private Storage. Guest mode uses IndexedDB on the current device.

## Run

Install from `pnpm-lock.yaml`, then `npm run dev`. Production: `npm run build` and `npm start`.

Required server environment variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FOUNDER_EMAIL`. Never use a service-role key in the browser. All writing queries run with the authenticated user's access token and owner-based RLS.

## Database

`database/schema.sql` is the initial schema applied to the BolToBook Supabase project. It includes record ownership, a private manuscripts bucket, write-only analytics/interest endpoints and a founder-only aggregate report. Do not apply it twice unchanged. Anonymous capture functions intentionally use restricted SECURITY DEFINER privileges; clients cannot read email lists or events.

## Account setup before public acquisition

Set Supabase Auth Site URL to the final Vercel/custom origin and configure allowed redirects. Configure custom SMTP for sign-up confirmation emails to people outside the Supabase project team; default Supabase mail is restricted. Keep email confirmation enabled. Signup is at `/auth`, guest studio at `/app`, founder analytics at `/founder`. Founder email must be confirmed.

## Current scope and limitations

This is an evaluation beta. Cover artwork uses templates, manuscript assembly preserves original words, and AI generation is not connected. Credits are free test credits, with demo top-ups, not paid money. The beta pricing button records interest and takes no payment. Existing Sites data is not automatically migrated: export/import text data in Settings; media needs separate transfer. Browser microphone support varies. Vercel request-size limits constrain proxied audio uploads; direct signed uploads are a follow-up for long recordings. Original Sites/Cloudflare build helpers are retained for history but are not used by the Next.js build.

## Verification

Next.js production compilation and TypeScript validation. Supabase transaction tests checked own-user book access, cross-user isolation, Hindi content, anonymous analytics and interest recording; test data was rolled back. Device microphone, print/export dialogs and email delivery require device and SMTP verification. Platform-level Vercel deployment protection remains enabled until explicitly changed.
