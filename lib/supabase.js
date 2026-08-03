// Server-only. The service_role key must never reach the browser.
// Every file that imports this is a route handler running on the server.

const URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function assertConfigured() {
  if (!URL || !KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. Add them to .env.local, or to the environment variables of your deployment.'
    );
  }
}

/**
 * Thin PostgREST wrapper. `path` is everything after /rest/v1/,
 * e.g. "email_verifications?select=*&limit=10".
 */
export async function sb(path, init = {}) {
  assertConfigured();
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function sbJson(path, init) {
  const res = await sb(path, init);
  return res.json();
}

/** Returns the exact row count for a filtered query without transferring rows. */
export async function sbCount(path) {
  const res = await sb(path.includes('?') ? `${path}&limit=1` : `${path}?limit=1`, {
    headers: { Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total && total !== '*' ? Number(total) : 0;
}

/** Builds a PostgREST query string from the dashboard's filter object. */
export function filterToQuery({ status, q, flag, source }) {
  const parts = [];
  if (status) parts.push(`status=eq.${encodeURIComponent(status)}`);
  if (source) parts.push(`source=eq.${encodeURIComponent(source)}`);
  if (flag) parts.push(`${encodeURIComponent(flag)}=is.true`);
  if (q) parts.push(`email=ilike.*${encodeURIComponent(q)}*`);
  return parts.join('&');
}
