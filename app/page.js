'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEGMENTS, SEGMENT_ORDER } from '@/lib/segments';

const COLORS = { safe:'#1c7a56', invalid:'#bf3b30', risky:'#b3782a', unknown:'#9aa0a8', error:'#6b5b8a' };
const ORDER  = ['safe','risky','unknown','invalid','error'];
const WORDS  = { safe:'Safe to send', risky:'Risky', unknown:'No answer', invalid:'Undeliverable', error:'Failed' };
const TABS   = [['overview','Overview'],['verify','Verify a list'],['batches','Batches'],['results','Results']];

const fmtDate = (s) => {
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}) + ', ' +
         d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
};
const n = (v) => Number(v || 0).toLocaleString();
const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const extractEmails = (s) => [...new Set((String(s).match(RE_EMAIL) || []).map(e => e.toLowerCase()))];

export default function Page() {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.error) { setErr(data.error); return null; }
      setErr(''); setStats(data); return data;
    } catch (e) { setErr(e.message); return null; }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="wrap">
      <header>
        <div className="topbar">
          <div>
            <div className="kicker">mx.brightsill.com</div>
            <h1>Verification&nbsp;Console</h1>
            <p className="standfirst">
              {stats?.latest ? `Last result ${fmtDate(stats.latest)}`
                : stats ? 'No results yet' : 'Loading…'}
            </p>
          </div>
          <div style={{ display:'flex', gap:14, alignItems:'center', paddingBottom:4 }}>
            <button onClick={loadStats}>Refresh</button>
          </div>
        </div>
        <nav role="tablist">
          {TABS.map(([id,label]) => (
            <button key={id} role="tab" aria-selected={tab===id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </header>

      {err && <div className="msg bad" style={{ marginTop:32 }}>{err}</div>}

      {tab === 'overview' && <Overview stats={stats} />}
      {tab === 'verify'   && <Verify onDone={loadStats} stats={stats} />}
      {tab === 'batches'  && <Batches onChange={loadStats} />}
      {tab === 'results'  && <Results batches={stats?.batches || []} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({ stats }) {
  if (!stats) return <section />;
  if (!stats.total) return (
    <section>
      <div className="blank">
        <b>Nothing verified yet</b>
        <span>Send a list through and the results will collect here.</span>
      </div>
    </section>
  );

  const present = ORDER.filter((s) => stats.byStatus[s]);

  return (
    <section>
      <div className="block">
        <div className="headline">
          <span className="figure">{n(stats.total)}</span>
          <span className="figure-note">
            {stats.total === 1 ? 'address checked' : 'addresses checked'}
          </span>
        </div>

        <div className="rulebar">
          {present.map((s) => (
            <span key={s} title={`${WORDS[s]}: ${n(stats.byStatus[s])}`}
              style={{ flex:`${stats.byStatus[s]} 1 0`, background:COLORS[s] }} />
          ))}
        </div>

        <div className="keys">
          {present.map((s) => (
            <div className="key" key={s}>
              <span className="swatch" style={{ background:COLORS[s] }} />
              <div className="n">{n(stats.byStatus[s])}</div>
              <div className="l">{WORDS[s]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block-head">
          <div className="eyebrow" style={{ marginBottom:9 }}>Diagnostic</div>
          <h2>Where the answers stop coming back</h2>
          <p className="lede">
            Sorted by the share of addresses no mail server would confirm either way. A high
            figure here is a statement about your sending address, not about the list. Microsoft
            hosts are the ones to watch: when outlook, hotmail and business tenants climb this
            list, one exit address has reached its limit and it is time for a second.
          </p>
        </div>
        <div className="ledger">
          {stats.providers.length ? stats.providers.map((p) => (
            <div className={'lrow' + (p.pct_unresolved > 25 ? ' hot' : '')} key={p.domain}>
              <span className="dom" title={p.domain}>{p.domain}</span>
              <span className="strip">
                {ORDER.filter((s) => p[s]).map((s) => (
                  <span key={s} style={{ flex:`${p[s]} 1 0`, background:COLORS[s] }} />
                ))}
              </span>
              <span className="fig"><b>{p.pct_unresolved}%</b> of {n(p.total)}</span>
            </div>
          )) : (
            <div className="lrow"><span className="dom">Not enough results to compare providers yet</span><span /><span /></div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Verify({ onDone, stats }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [run, setRun] = useState(null);
  const fileRef = useRef(null);
  const timer = useRef(null);

  const count = extractEmails(text).length;

  function readFile(f) {
    const rd = new FileReader();
    rd.onload = () => {
      setText(extractEmails(rd.result).join('\n'));
      if (!source) setSource(f.name.replace(/\.[^.]+$/, ''));
      setMsg({ ok:true, text:`${f.name} loaded. Duplicates and anything already verified are removed when you start.` });
    };
    rd.readAsText(f);
  }

  async function start() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/verify', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ source: source || 'dashboard', text }),
      });
      const data = await res.json();
      if (data.error) { setMsg({ ok:false, text:data.error }); return; }
      setMsg({ ok:true, text:data.message });
      if (data.queued) {
        const base = stats?.total || 0;
        setRun({ expected:data.queued, base, started:Date.now(), done:0, rate:0 });
      }
    } catch (e) {
      setMsg({ ok:false, text:e.message });
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!run) return;
    timer.current = setInterval(async () => {
      const s = await onDone();
      if (!s) return;
      const done = Math.max(0, s.total - run.base);
      const mins = (Date.now() - run.started) / 60000;
      setRun((r) => r && ({ ...r, done, rate: mins > 0.1 ? Math.round(done/mins) : 0 }));
      if (done >= run.expected) { clearInterval(timer.current); }
    }, 8000);
    return () => clearInterval(timer.current);
  }, [run?.expected, run?.base, onDone]); // eslint-disable-line

  const pct = run ? Math.min(100, Math.round(run.done / run.expected * 100)) : 0;
  const finished = run && run.done >= run.expected;

  return (
    <section>
      <div className="block">
        <div className="block-head">
          <h2>Send a list through</h2>
          <p className="lede">
            Drop a CSV or paste addresses. Column names do not matter — anything shaped like an
            address is picked up. Duplicates are dropped, and anything verified in the last
            ninety days is left out, so you never spend throughput twice.
          </p>
        </div>

        <div className="drop" tabIndex={0} role="button"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('over')}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over');
            const f = e.dataTransfer.files[0]; if (f) readFile(f); }}>
          <b>Drop a CSV here</b>
          <span>or choose a file</span>
          <input type="file" ref={fileRef} accept=".csv,.txt" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
        </div>

        <div style={{ marginTop:26 }}>
          <label htmlFor="paste">Or paste addresses</label>
          <textarea id="paste" rows={6} spellCheck={false} value={text}
            placeholder={'one@example.com\ntwo@example.com'}
            onChange={(e) => setText(e.target.value)} />
          {count > 0 && <div className="tally" style={{ marginTop:10 }}>{n(count)} addresses in the box</div>}
        </div>

        <div className="fields" style={{ marginTop:26 }}>
          <div>
            <label htmlFor="source">Name this batch</label>
            <input id="source" value={source} placeholder="apollo scrape, august"
              spellCheck={false} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <button className="primary" style={{ width:'100%' }} disabled={busy || !count} onClick={start}>
              {busy ? 'Sending…' : 'Start verification'}
            </button>
          </div>
        </div>

        {msg && <div className={'msg ' + (msg.ok ? 'ok' : 'bad')}>{msg.text}</div>}

        {run && (
          <div className="run">
            <div className="eyebrow">{finished ? 'Complete' : 'In progress'}</div>
            <div className="track"><i style={{ width: pct + '%' }} /></div>
            <div className="runline">
              <span>
                {finished
                  ? <><b>Finished.</b> {n(run.done)} addresses verified.</>
                  : <><b>{n(run.done)}</b> of {n(run.expected)} verified</>}
              </span>
              <span>
                {!finished && run.rate
                  ? `${run.rate} a minute · roughly ${Math.ceil((run.expected - run.done) / Math.max(run.rate,1))} min left`
                  : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Results({ batches }) {
  const [f, setF] = useState({ status:'', q:'', flag:'', source:'' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows:[], matched:0, pageSize:100 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const qs = new URLSearchParams({ ...f, page:String(page) });
      const res = await fetch('/api/verifications?' + qs);
      const d = await res.json();
      if (!d.error) setData(d);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [f, page]);

  const set = (k) => (e) => { setPage(0); setF({ ...f, [k]: e.target.value }); };
  const pages = Math.ceil(data.matched / (data.pageSize || 100));

  return (
    <section>
      <div className="controls">
        <div>
          <label htmlFor="fstatus">Verdict</label>
          <select id="fstatus" value={f.status} onChange={set('status')}>
            <option value="">Everything</option>
            {ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="grow">
          <label htmlFor="fsearch">Find an address or domain</label>
          <input id="fsearch" value={f.q} placeholder="gmail.com" spellCheck={false} onChange={set('q')} />
        </div>
        <div>
          <label htmlFor="fflag">Flag</label>
          <select id="fflag" value={f.flag} onChange={set('flag')}>
            <option value="">Any</option>
            <option value="catch_all">Catch-all</option>
            <option value="role_account">Role account</option>
            <option value="disposable">Disposable</option>
            <option value="full_inbox">Full inbox</option>
          </select>
        </div>
        <div>
          <label htmlFor="fsource">Batch</label>
          <select id="fsource" value={f.source} onChange={set('source')}>
            <option value="">All</option>
            {batches.map((b) => <option key={b.source} value={b.source}>{b.source}</option>)}
          </select>
        </div>
        <div>
          <a href={'/api/export?' + new URLSearchParams(f)}>
            <button type="button">Export CSV</button>
          </a>
        </div>
      </div>

      <div className="tally">
        {loading ? 'Loading…' : `${n(data.matched)} matching ${data.matched === 1 ? 'address' : 'addresses'}`}
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Address</th><th>Verdict</th><th>Flags</th><th>Batch</th><th>Checked</th>
          </tr></thead>
          <tbody>
            {data.rows.map((r) => {
              const st = r.status || 'unknown';
              const flags = [
                r.catch_all && 'catch-all', r.role_account && 'role',
                r.disposable && 'disposable', r.full_inbox && 'full inbox',
              ].filter(Boolean);
              return (
                <tr key={r.email}>
                  <td className="addr">{r.email}</td>
                  <td><span className="verdict"><i style={{ background:COLORS[st] }} />{st}</span></td>
                  <td className="flag">{flags.length ? flags.map((x,i) => <b key={i}>{x}{i<flags.length-1?', ':''}</b>) : '—'}</td>
                  <td className="meta">{r.source || '—'}</td>
                  <td className="meta">{fmtDate(r.checked_at)}</td>
                </tr>
              );
            })}
            {!data.rows.length && !loading && (
              <tr><td colSpan={5} className="meta" style={{ textAlign:'center', padding:'40px 0' }}>
                Nothing matches those filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="tally">Page {page + 1} of {n(pages)}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Batches({ onChange }) {
  const [rows, setRows] = useState(null);
  const [all, setAll] = useState(null);
  const [open, setOpen] = useState('__all__');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/batches');
      const d = await res.json();
      if (d.error) { setMsg({ ok:false, text:d.error }); return; }
      setRows(d.batches || []); setAll(d.all || null);
    } catch (e) { setMsg({ ok:false, text:e.message }); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(source, label) {
    const typed = window.prompt(`Deleting ${label} removes those addresses from the cache, so they will be verified again next time they appear.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    setBusy(source || '__all__');
    try {
      const qs = source === null ? 'all=1' : `source=${encodeURIComponent(source)}`;
      const res = await fetch(`/api/batches?${qs}`, { method:'DELETE' });
      const d = await res.json();
      setMsg(d.error ? { ok:false, text:d.error } : { ok:true, text:d.message });
      await load(); await onChange();
    } catch (e) { setMsg({ ok:false, text:e.message }); }
    finally { setBusy(''); }
  }

  if (!rows) return <section><div className="tally">Loading…</div></section>;

  const panel = (b) => (
    <div className="segments">
      {SEGMENT_ORDER.map(k => (
        <a key={k} className={"seg" + (Number(b[k]||0) === 0 ? " seg-empty" : "")} href={`/api/export?segment=${k}${b.source ? `&source=${encodeURIComponent(b.source)}` : ''}`}>
          <span className="seg-n">{n(b[k])}</span>
          <span className="seg-l">{SEGMENTS[k].label}</span>
          <span className="seg-note">{SEGMENTS[k].note}</span>
          <span className="seg-dl">Download CSV</span>
        </a>
      ))}
    </div>
  );

  const row = (b, key, label) => {
    const isOpen = open === key;
    return (
      <div key={key}>
        <div className="lrow" style={{ gridTemplateColumns:'1fr 90px 90px 110px 150px 170px' }}>
          <button className="linky" onClick={() => setOpen(isOpen ? '' : key)}>{isOpen ? '▾' : '▸'} {label}</button>
          <span className="fig">{n(b.total)}</span>
          <span className="fig"><b>{n(b.mailable)}</b></span>
          <span className="fig">{n(b.unresolved)}</span>
          <span className="meta">{fmtDate(b.last_seen)}</span>
          <span style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" style={{ padding:'7px 13px', fontSize:12.5 }} onClick={() => setOpen(isOpen ? '' : key)}>{isOpen ? 'Hide' : 'Downloads'}</button>
            <button type="button" disabled={busy === (b.source ?? '__all__')} style={{ padding:'7px 13px', fontSize:12.5 }}
              onClick={() => remove(b.source ?? null, b.source ? `"${b.source}" (${n(b.total)} addresses)` : 'every batch')}>
              {busy === (b.source ?? '__all__') ? '…' : 'Delete'}
            </button>
          </span>
        </div>
        {isOpen && panel(b)}
      </div>
    );
  };

  return (
    <section>
      <div className="block">
        <div className="block-head">
          <h2>Batches and downloads</h2>
          <p className="lede">Open a batch to pull any slice of it as a CSV — the send list, the suppression list, the catch-all domains, or the ones no mail server would answer for. Each download carries every stored field, so you can join it back to your own data.</p>
        </div>
        <div className="ledger">
          <div className="lrow" style={{ gridTemplateColumns:'1fr 90px 90px 110px 150px 170px', paddingBottom:10 }}>
            <span className="eyebrow">Batch</span>
            <span className="eyebrow" style={{ textAlign:'right' }}>Total</span>
            <span className="eyebrow" style={{ textAlign:'right' }}>Mailable</span>
            <span className="eyebrow" style={{ textAlign:'right' }}>No answer</span>
            <span className="eyebrow">Last run</span>
            <span />
          </div>
          {all && all.total > 0 && row(all, '__all__', 'Everything')}
          {rows.map(b => row(b, b.source, b.source))}
          {!rows.length && (<div className="lrow"><span className="dom">No batches yet</span><span /><span /></div>)}
        </div>
        {msg && <div className={'msg ' + (msg.ok ? 'ok' : 'bad')}>{msg.text}</div>}
      </div>
    </section>
  );
}
