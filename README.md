# Verification Console

Dashboard for the self-hosted Reacher stack. Supabase credentials and the n8n
webhook live on the server; the browser only ever talks to this app's own API.

## What runs where

```
browser  ──►  /api/stats           aggregate counts, from Postgres views
              /api/verifications   paginated, filtered rows
              /api/verify          dedupes, then forwards to n8n
              /api/export          streams CSV
                   │
                   ├──►  Supabase   (service_role key, server-side only)
                   └──►  n8n        (webhook URL, server-side only)
```

Nothing is prefixed `NEXT_PUBLIC_`, so no key is bundled into the client. The
service_role key never leaves the server, and the n8n webhook URL is never
visible in the page source — which also means no CORS configuration is needed,
since the call is server to server.

## Setup

**1. Database.** Run `schema.sql` in Supabase → SQL Editor. It creates the table
plus four views that do the counting in Postgres. That matters at your volume:
the app never pulls a million rows just to total them.

**2. Environment.** Copy `.env.example` to `.env.local` and fill it in. The
service_role key is under Project Settings → API.

**3. Install and run.**

```bash
npm install
npm run dev
```

**4. n8n.** Add a **Webhook** node (POST, path `verify`) beside the existing form
trigger. It receives:

```json
{ "source": "apollo scrape", "emails": ["a@x.com", "b@y.com"] }
```

Follow it with a Code node to fan the array out into items:

```javascript
return $json.body.emails.map(e => ({
  json: { email: e, source: $json.body.source }
}));
```

Then into your existing Loop → Verify Email → Flatten Result chain, and finish
with a **Supabase → Create Row** node writing to `email_verifications`. Set it to
upsert on `email` so a re-check updates rather than fails. Include `source` in
the mapping or batch filtering will be empty.

If you set `N8N_WEBHOOK_SECRET`, the app sends it as `x-dashboard-secret`. Add an
IF node in n8n that drops anything without it.

**5. Deploy.** Push to a repo, import in Vercel, paste the same four variables
into Project Settings → Environment Variables. No build configuration needed.

## Notes

- `/api/verify` skips any address verified in the last 90 days. Change the window
  by posting `freshnessDays`.
- Export streams in pages of 1,000, so a large export will not exhaust memory.
- The provider table is the diagnostic worth watching. When Microsoft-hosted
  domains climb it, the sending IP is at its ceiling — that is the signal to add
  a second exit rather than to tune anything in here.
