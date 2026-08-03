import { sb, sbJson } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** List every batch with its verdict breakdown. */
export async function GET() {
  try {
    const rows = await sbJson('verification_batch_stats?select=*');
    return Response.json({ batches: rows });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/batches?source=apollo-aug   removes one batch
 * DELETE /api/batches?all=1               removes everything
 *
 * Deleting drops those addresses from the verification cache, so they
 * will be re-verified (and re-charged in throughput) next time they appear.
 */
export async function DELETE(request) {
  try {
    const p = new URL(request.url).searchParams;
    const source = p.get('source');
    const all = p.get('all');

    let query;
    if (all === '1') {
      // PostgREST refuses an unfiltered delete, so use a filter that matches everything.
      query = 'email_verifications?email=neq.__never__';
    } else if (source === '(unnamed)') {
      query = 'email_verifications?source=is.null';
    } else if (source) {
      query = `email_verifications?source=eq.${encodeURIComponent(source)}`;
    } else {
      return Response.json(
        { error: 'Pass either source or all=1.' },
        { status: 400 }
      );
    }

    const res = await sb(query, {
      method: 'DELETE',
      headers: { Prefer: 'count=exact' },
    });

    const range = res.headers.get('content-range') || '';
    const totalPart = range.split('/')[1];
    const deleted = totalPart && totalPart !== '*' ? Number(totalPart) : null;

    return Response.json({
      deleted,
      message:
        deleted === null
          ? 'Deleted.'
          : `Deleted ${deleted.toLocaleString()} ${deleted === 1 ? 'address' : 'addresses'}.`,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
