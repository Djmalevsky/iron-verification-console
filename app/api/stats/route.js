import { sbJson } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [statuses, providers, batches, flags, latest] = await Promise.all([
      sbJson('verification_status_stats?select=*'),
      sbJson('verification_provider_stats?select=*&limit=16'),
      sbJson('verification_batches?select=*&limit=200'),
      sbJson('verification_flag_stats?select=*'),
      sbJson('email_verifications?select=checked_at&order=checked_at.desc&limit=1'),
    ]);

    const byStatus = {};
    let total = 0;
    for (const row of statuses) {
      byStatus[row.status] = Number(row.n);
      total += Number(row.n);
    }

    return Response.json({
      total,
      byStatus,
      providers,
      batches,
      flags: flags[0] || {},
      latest: latest[0]?.checked_at || null,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
