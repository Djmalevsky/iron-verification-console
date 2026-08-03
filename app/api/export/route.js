import { sb, filterToQuery } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const COLS = [
  'email', 'status', 'domain', 'deliverable', 'catch_all',
  'full_inbox', 'role_account', 'disposable', 'source', 'checked_at',
];
const PAGE = 1000;

const esc = (v) =>
  v === null || v === undefined
    ? ''
    : /[",\n]/.test(String(v))
    ? `"${String(v).replace(/"/g, '""')}"`
    : String(v);

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const filters = filterToQuery({
    status: p.get('status'),
    q: p.get('q'),
    flag: p.get('flag'),
    source: p.get('source'),
  });
  const base =
    `email_verifications?select=${COLS.join(',')}&order=checked_at.desc` +
    (filters ? `&${filters}` : '');

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(COLS.join(',') + '\n'));
      try {
        for (let page = 0; ; page++) {
          const res = await sb(base, {
            headers: {
              Range: `${page * PAGE}-${page * PAGE + PAGE - 1}`,
              'Range-Unit': 'items',
            },
          });
          const rows = await res.json();
          if (!rows.length) break;
          controller.enqueue(
            enc.encode(rows.map((r) => COLS.map((c) => esc(r[c])).join(',')).join('\n') + '\n')
          );
          if (rows.length < PAGE) break;
        }
      } catch (err) {
        controller.enqueue(enc.encode(`\n# export stopped: ${err.message}\n`));
      }
      controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="verifications-${stamp}.csv"`,
    },
  });
}
