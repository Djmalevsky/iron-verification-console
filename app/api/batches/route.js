import { sb, sbJson } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [rows, split] = await Promise.all([
      sbJson('verification_segments?select=*'),
      sbJson('verification_segments_by_verifier?select=*'),
    ]);

    // Attach each batch's per-verifier breakdown.
    const bySource = {};
    for (const r of split) (bySource[r.source] = bySource[r.source] || []).push(r);
    for (const r of rows) r.verifiers = bySource[r.source] || [];
    const keys = ['total','deliverable','safe_all','role','risky_all','catch_all','unresolved','invalid','disposable','full_inbox','error','discarded','mailable'];
    const all = { source:null, last_seen:null };
    keys.forEach(k => all[k] = 0);
    for (const r of rows) {
      keys.forEach(k => all[k] += Number(r[k] || 0));
      if (!all.last_seen || new Date(r.last_seen) > new Date(all.last_seen)) all.last_seen = r.last_seen;
    }
    // Totals per verifier across every batch.
    const vAll = {};
    for (const r of split) {
      const v = r.verifier || 'reacher';
      vAll[v] = vAll[v] || { verifier: v };
      for (const k of keys) vAll[v][k] = (vAll[v][k] || 0) + Number(r[k] || 0);
    }
    all.verifiers = Object.values(vAll);

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
