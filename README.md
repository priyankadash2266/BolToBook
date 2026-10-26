# BolToBook

# Dictationer author studio

A voice-first English/Hindi book-writing beta, evolved from the supplied Dictationer project. Existing React workspace retained under `src/screens`; Vinext handles hosted API routes and the client shell.

## Develop

Use Node 22+ and the repository's package manager.

```
pnpm install
pnpm dev
pnpm build
node node_modules/typescript/bin/tsc --noEmit
node tests/server.test.mjs
```

D1 migrations are in `drizzle/`. The hosting manifest declares DB and BUCKET bindings. Sites provisions these during deployment. Auth comes from Sites authenticated headers; each record is scoped to its signed-in owner. Runtime secret `FOUNDER_EMAIL` restricts `/api/founder`. Do not place secrets in frontend code.

## Routes

- `/` and `/hi`: landing pages and beta interest test.
- `/start`: book onboarding.
- `/app/library`: books.
- `/app/laps`: idea inbox.
- `/app/laps?capture=1`: quick capture entry point.
- `/app/b/:bookId/chapters`: chapter planning and idea assembly.
- `/app/b/:bookId/cover`: cover directions and run history.
- `/app/b/:bookId/generate`: multi-size/style previews and exports.
- `/app/settings`: preferences, backup import/export and evaluation credits.
- `/founder`: owner dashboard. Data is protected on the server, not just hidden in the UI.

## Honest capability boundaries

This is a private review beta. Generation uses existing illustrated cover templates and browser pagination. There are no real AI provider calls or monetary payments. Credit costs and top-ups are evaluation-only. The Buy beta button records interest; it does not create a subscription. The proposed price is ₹499/month and needs validation.

Guest work stays in its browser. Signed-in work uses cloud storage. To migrate guest content, export the guest backup and import it when signed in. Audio/media are not included in the JSON backup format, so download important files separately. Concurrent editing is not collaborative; avoid editing the same field on multiple devices at once.

See `PRODUCT_PLAN.md` for decisions, research, launch dependencies and verification limits.


## Vercel migration status
This snapshot preserves the working Sites beta. It is not yet deployable on Vercel: the Cloudflare D1/R2 bindings and trusted ChatGPT identity headers must be replaced with independent storage and verified authentication first. Do not deploy the existing auth helper on a public Node server.
