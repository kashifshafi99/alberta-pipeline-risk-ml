import { useState, useMemo, useEffect, Fragment } from 'react';
import Papa from 'papaparse';
import { fmt } from './data.js';

const PAGE = 15;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '');

const COLUMNS = [
  { key: 'time', label: 'Reported', get: (r) => r.time, render: (r) => iso(r.date) },
  { key: 'id', label: 'Incident', get: (r) => r.id, render: (r) => r.id },
  { key: 'type', label: 'Type', get: (r) => r.types.join(', '), render: (r) => r.types.join(', ') },
  { key: 'province', label: 'Province', get: (r) => r.province, render: (r) => r.province },
  { key: 'operator', label: 'Operator', get: (r) => r.operator, render: (r) => r.operator },
  { key: 'what', label: 'Cause', get: (r) => r.what.join(', '), render: (r) => r.what.join(', ') || '—' },
  { key: 'sig', label: 'Significant', get: (r) => (r.sig ? 1 : 0), render: (r) => (r.sig ? <span className="tag tag-sig">Yes</span> : 'No') },
  { key: 'status', label: 'Status', get: (r) => r.status, render: (r) => r.status },
];

function download(rows) {
  const csv = Papa.unparse(rows.map((r) => r.raw));
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pipeline-incidents-filtered.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function IncidentTable({ rows, compact }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'time', dir: -1 });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  useEffect(() => { setPage(1); setOpen(null); }, [rows, query, sort]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter((r) => [r.id, r.place, r.company, r.operator, r.province].some((v) => v && v.toLowerCase().includes(q)))
      : rows;
    const col = COLUMNS.find((c) => c.key === sort.key);
    return [...list].sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return c * sort.dir || b.time - a.time;
    });
  }, [rows, query, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice((page - 1) * PAGE, page * PAGE);
  const by = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'time' || key === 'sig' ? -1 : 1 }));

  return (
    <section className="card table-card">
      <header className="card-head table-head">
        <div>
          <h2 className="card-title">Incident records</h2>
          <p className="card-sub">{fmt(shown.length)} records · click a row for details</p>
        </div>
        <div className="table-tools">
          <input
            type="search" placeholder="Search incident, place or operator" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search incident records"
          />
          <button type="button" className="btn" onClick={() => download(shown)} disabled={!shown.length}>
            Download CSV
          </button>
        </div>
      </header>

      <div className="table-scroll">
        <table className="tbl">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => by(c.key)}>
                    {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className={open === r.id ? 'row-open' : ''} tabIndex={0}
                  onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => (o === r.id ? null : r.id)); } }}
                  aria-expanded={open === r.id}
                >
                  {COLUMNS.map((c) => <td key={c.key}>{c.render(r)}</td>)}
                </tr>
                {open === r.id && (
                  <tr className="row-detail">
                    <td colSpan={COLUMNS.length}>
                      <dl className="detail">
                        <div><dt>Nearest place</dt><dd>{r.place || '—'}</dd></div>
                        <div><dt>Activity</dt><dd>{r.activity || '—'}</dd></div>
                        <div><dt>Substance</dt><dd>{r.substance || '—'}</dd></div>
                        <div><dt>Volume released (m³)</dt><dd>{r.volume && r.volume !== 'Not Applicable' ? r.volume : '—'}</dd></div>
                        <div><dt>Land use</dt><dd>{r.landUse || 'Not recorded'}</dd></div>
                        <div><dt>Operator (legal name)</dt><dd>{r.company || '—'}</dd></div>
                        <div className="wide"><dt>What happened</dt><dd>{r.whatDetail || '—'}</dd></div>
                        <div className="wide"><dt>Why it happened</dt><dd>{r.whyDetail || '—'}</dd></div>
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!slice.length && <p className="card-empty">No records match your search.</p>}
      </div>

      <nav className="pager" aria-label="Table pages">
        <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </nav>
      {compact && <p className="card-note">Swipe the table sideways to see every column.</p>}
    </section>
  );
}
