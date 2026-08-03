import { sb, filterToQuery } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const PAGE = 100;

export async function GET(request) {
  try {
    const p = new URL(request.url).searchParams;
    const page = Math.max(0, Number(p.get('page') || 0));
    const filters = filterToQuery({
      status: p.get('status'),
      q: p.get('q'),
      flag: p.get('flag'),
      source: p.get('source'),
    });

    const query =
      `email_verifications?select=*&order=checked_at.desc` +
      (filters ? `&${filters}` : '');

    const res = await sb(query, {
      headers: {
        Prefer: 'count=exact',
        Range: `${page * PAGE}-${page * PAGE + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });

    const rows = await res.json();
    const range = res.headers.get('content-range') || '';
    const totalPart = range.split('/')[1];
    const matched = totalPart && totalPart !== '*' ? Number(totalPart) : rows.length;

    return Response.json({ rows, matched, page, pageSize: PAGE });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
