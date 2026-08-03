-- Run in Supabase → SQL Editor.

create table if not exists email_verifications (
  email         text primary key,
  status        text not null,          -- safe | invalid | risky | unknown | error
  domain        text,
  deliverable   boolean,
  catch_all     boolean,
  full_inbox    boolean,
  role_account  boolean,
  disposable    boolean,
  source        text,
  checked_at    timestamptz not null default now()
);

create index if not exists idx_ev_status     on email_verifications (status);
create index if not exists idx_ev_domain     on email_verifications (domain);
create index if not exists idx_ev_source     on email_verifications (source);
create index if not exists idx_ev_checked_at on email_verifications (checked_at desc);

-- Nothing reaches this table from a browser. The dashboard talks to its own
-- server, which holds the service_role key. So deny anon outright.
alter table email_verifications enable row level security;

-- ---------------------------------------------------------------
-- Aggregates computed in Postgres, so the app never pulls raw rows
-- just to count them. This is what keeps it fast at a million rows.
-- ---------------------------------------------------------------

create or replace view verification_status_stats as
select
  status,
  count(*)::bigint as n
from email_verifications
group by status;

create or replace view verification_provider_stats as
select
  coalesce(domain, split_part(email, '@', 2)) as domain,
  count(*)::bigint                                             as total,
  count(*) filter (where status = 'safe')::bigint              as safe,
  count(*) filter (where status = 'risky')::bigint             as risky,
  count(*) filter (where status = 'unknown')::bigint           as unknown,
  count(*) filter (where status = 'invalid')::bigint           as invalid,
  count(*) filter (where status = 'error')::bigint             as error,
  round(
    100.0 * count(*) filter (where status in ('unknown','error')) / count(*)
  , 1)::float                                                  as pct_unresolved
from email_verifications
group by 1
having count(*) >= 3
order by pct_unresolved desc, total desc;

create or replace view verification_batches as
select source, count(*)::bigint as n, max(checked_at) as last_seen
from email_verifications
where source is not null
group by source
order by last_seen desc;

create or replace view verification_flag_stats as
select
  count(*) filter (where catch_all)::bigint     as catch_all,
  count(*) filter (where role_account)::bigint  as role_account,
  count(*) filter (where disposable)::bigint    as disposable,
  count(*) filter (where full_inbox)::bigint    as full_inbox
from email_verifications;
