import { sb, sbJson } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sbJson('verification_segments?select=*');
    const keys = ['total','deliverable','safe_all','role','catch_all','unresolved','invalid','disposable','full_inbox','mailable'];
    const all = { source:null, last_seen:null };
    keys.forEach(k => all[k] = 0);
    for (const r of rows) {
      keys.forEach(k => all[k] += Number(r[k] || 0));
      if (!all.last_seen || new Date(r.last_seen) > new Date(all.last_seen)) all.last_seen = r.last_seen;
    }
    return Response.json({ batches: rows, all });
  } catch (err) { return Response.json({ error: err.message }, { status:500 }); }
}

export async function DELETE(request) {
  try {
    const p = new URL(request.url).searchParams;
    const source = p.get('source'); const all = p.get('all');
    let query;
    if (all === '1') query = 'email_verifications?email=neq.__never__';
    else if (source === '(unnamed)') query = 'email_verifications?source=is.null';
    else if (source) query = `email_verifications?source=eq.${encodeURIComponent(source)}`;
    else return Response.json({ error:'Pass either source or all=1.' }, { status:400 });
    const res = await sb(query, { method:'DELETE', headers:{ Prefer:'count=exact' } });
    const range = res.headers.get('content-range') || '';
    const t = range.split('/')[1];
    const deleted = t && t !== '*' ? Number(t) : null;
    return Response.json({ deleted, message: deleted===null ? 'Deleted.' : `Deleted ${deleted.toLocaleString()} ${deleted===1?'address':'addresses'}.` });
  } catch (err) { return Response.json({ error: err.message }, { status:500 }); }
}
