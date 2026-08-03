import { sbJson } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const MAX = 100000;
const CHUNK = 500;

/**
 * Accepts { source, emails: [] } or { source, text: "..." }.
 * Drops duplicates, drops anything verified inside the freshness window,
 * then hands the remainder to n8n. The webhook URL stays on the server.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const days = Number(body.freshnessDays ?? 90);

    const raw = Array.isArray(body.emails)
      ? body.emails.join('\n')
      : String(body.text || '');
    const emails = [...new Set((raw.match(RE) || []).map((e) => e.toLowerCase()))];

    if (!emails.length) {
      return Response.json({ error: 'No addresses found in that input.' }, { status: 400 });
    }
    if (emails.length > MAX) {
      return Response.json(
        { error: `That is ${emails.length.toLocaleString()} addresses. Split it into batches under ${MAX.toLocaleString()}.` },
        { status: 400 }
      );
    }

    // Which of these do we already have a recent verdict for?
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const seen = new Set();
    for (let i = 0; i < emails.length; i += CHUNK) {
      const slice = emails.slice(i, i + CHUNK);
      const list = slice.map((e) => `"${e}"`).join(',');
      const rows = await sbJson(
        `email_verifications?select=email&email=in.(${encodeURIComponent(list)})&checked_at=gte.${cutoff}`
      );
      rows.forEach((r) => seen.add(r.email));
    }

    const fresh = emails.filter((e) => !seen.has(e));
    const skipped = emails.length - fresh.length;

    if (!fresh.length) {
      return Response.json({
        queued: 0,
        skipped,
        message: `All ${skipped.toLocaleString()} addresses were verified within the last ${days} days. Nothing sent.`,
      });
    }

    const hook = process.env.N8N_WEBHOOK_URL;
    if (!hook) {
      return Response.json(
        { error: 'N8N_WEBHOOK_URL is not set on the server.' },
        { status: 500 }
      );
    }

    const res = await fetch(hook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { 'x-dashboard-secret': process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({ source: body.source || 'dashboard', emails: fresh }),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `n8n answered ${res.status}. ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    return Response.json({
      queued: fresh.length,
      skipped,
      message:
        `Queued ${fresh.length.toLocaleString()} addresses` +
        (skipped ? `, skipping ${skipped.toLocaleString()} already verified.` : '.'),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
