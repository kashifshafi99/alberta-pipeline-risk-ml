import { useState, useEffect, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import {
  EMPTY_FILTERS, FILTER_LABELS, SEVERITY_LABELS,
  toRecord, applyFilters, tally, summarize, pct, fmt,
} from './data.js';
import { THEME_COLORS, Card, StackedBars, YearColumns, RateBars } from './charts.jsx';
import IncidentTable from './IncidentTable.jsx';

const REPO_URL = 'https://github.com/kashifshafi99/alberta-pipeline-risk-ml';
const DATA_URL = 'https://open.canada.ca/data/en/dataset/fd17f08f-f14d-433f-91df-c90a34e1e9a6';

/* ─── small hooks ──────────────────────────────────────────── */
function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function initialTheme() {
  try {
    const saved = localStorage.getItem('pid-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readHash() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const f = { ...EMPTY_FILTERS };
  for (const k of Object.keys(EMPTY_FILTERS)) if (p.get(k)) f[k] = p.get(k);
  return f;
}

const dateFmt = new Intl.DateTimeFormat('en-CA', { day: 'numeric', month: 'short', year: 'numeric' });

/* ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState(readHash);
  const [theme, setTheme] = useState(initialTheme);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const width = useWidth();
  const compact = width < 760;
  const colors = THEME_COLORS[theme];

  /* load data */
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}pipeline-incidents-comprehensive-data.csv`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
        setRecords(data.map(toRecord));
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  /* theme */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pid-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  /* keep filters in the URL so a view can be shared */
  useEffect(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    const h = p.toString();
    window.history.replaceState(null, '', h ? `#${h}` : window.location.pathname + window.location.search);
  }, [filters]);

  const setFilter = useCallback((key, value) => setFilters((f) => ({ ...f, [key]: value })), []);
  const toggle = useCallback((key) => (value) => setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value })), []);
  const clearAll = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);

  /* data coverage */
  const meta = useMemo(() => {
    if (!records.length) return null;
    const maxTime = Math.max(...records.map((r) => r.time));
    const minYear = Math.min(...records.map((r) => r.year));
    const maxDate = new Date(maxTime);
    const maxYear = maxDate.getFullYear();
    const partialYear = maxDate.getMonth() < 11 ? maxYear : null;
    const years = [];
    for (let y = minYear; y <= maxYear; y += 1) years.push(String(y));
    return { maxDate, minYear, maxYear, partialYear, years };
  }, [records]);

  const options = useMemo(() => {
    const uniq = (fn, multi) => [...new Set(records.flatMap((r) => (multi ? fn(r) : [fn(r)])).filter(Boolean))].sort();
    return {
      province: uniq((r) => r.province),
      type: uniq((r) => r.types, true),
      operator: uniq((r) => r.operator),
      what: uniq((r) => r.what, true),
      activity: uniq((r) => r.activity),
    };
  }, [records]);

  const filtered = useMemo(() => applyFilters(records, filters), [records, filters]);
  const kpi = useMemo(() => summarize(filtered), [filtered]);

  /* each chart ignores its own filter, so the selection is shown in context */
  const view = useMemo(() => {
    const ex = (...keys) => applyFilters(records, filters, keys);
    const byYear = new Map(tally(ex('yearFrom', 'yearTo'), (r) => r.year).map((d) => [d.name, d]));
    const years = (meta?.years || []).map((y) => byYear.get(y) || { name: y, total: 0, sig: 0, other: 0, rate: 0 });
    const activity = tally(ex('activity'), (r) => r.activity).filter((d) => d.total >= 5).sort((a, b) => b.rate - a.rate);
    return {
      years,
      type: tally(ex('type'), (r) => r.types, true),
      province: tally(ex('province'), (r) => r.province),
      operator: tally(ex('operator'), (r) => r.operator).slice(0, 10),
      what: tally(ex('what'), (r) => r.what, true),
      why: tally(ex('why'), (r) => r.why, true),
      activity,
      activityBase: summarize(ex('activity')).rate,
      substance: tally(ex('substance'), (r) => r.substance).slice(0, 8),
      landUse: tally(ex('landUse'), (r) => r.landUse),
      landKnown: ex('landUse').filter((r) => r.landUse).length,
      landBase: ex('landUse').length,
    };
  }, [records, filters, meta]);

  /* plain-language findings for the current selection */
  const insights = useMemo(() => {
    const out = [];
    if (filtered.length < 10) return out;
    const full = tally(filtered.filter((r) => r.year !== meta?.partialYear), (r) => r.year);
    if (full.length > 1) {
      const peak = full[0];
      out.push({ k: 'Peak year', text: `${peak.name} had the most incidents in this view: ${fmt(peak.total)}.` });
    }
    const act = tally(filtered, (r) => r.activity).filter((a) => a.total >= 20).sort((a, b) => b.rate - a.rate);
    if (act.length >= 2) {
      const hi = act[0], lo = act[act.length - 1];
      out.push({ k: 'Riskiest activity', text: `${hi.name} incidents became significant ${pct(hi.rate)} of the time, vs ${pct(lo.rate)} during ${lo.name.toLowerCase()}.` });
    }
    const causes = tally(filtered, (r) => r.what, true).filter((w) => !/^(To be determined|Other Causes)$/.test(w.name));
    if (causes.length) {
      out.push({ k: 'Most common cause', text: `${causes[0].name} was involved in ${pct(causes[0].total / filtered.length)} of incidents.` });
    }
    return out;
  }, [filtered, meta]);

  /* exposed for automated checks */
  useEffect(() => {
    window.__DASH__ = { kpi, view, count: filtered.length };
  }, [kpi, view, filtered]);

  const chips = useMemo(() => {
    const c = [];
    if (filters.yearFrom || filters.yearTo) {
      const from = filters.yearFrom || meta?.minYear;
      const to = filters.yearTo || meta?.maxYear;
      c.push({ key: 'years', label: 'Years', value: from === to ? `${from}` : `${from}–${to}`, clear: ['yearFrom', 'yearTo'] });
    }
    for (const k of Object.keys(FILTER_LABELS)) {
      if (filters[k]) c.push({ key: k, label: FILTER_LABELS[k], value: k === 'severity' ? SEVERITY_LABELS[filters[k]] : filters[k], clear: [k] });
    }
    return c;
  }, [filters, meta]);

  const onYear = useCallback((y) => {
    setFilters((f) => (f.yearFrom === y && f.yearTo === y ? { ...f, yearFrom: '', yearTo: '' } : { ...f, yearFrom: y, yearTo: y }));
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  }, []);

  if (status === 'loading') return <div className="state">Loading incident data…</div>;
  if (status === 'error') return <div className="state">The data file could not be loaded. Please refresh the page.</div>;

  const labelW = compact ? 118 : 196;
  const chars = compact ? 17 : 30;

  return (
    <div className="app">
      <header className="top">
        <div className="top-inner">
          <div>
            <h1>Canadian Pipeline Incidents</h1>
            <p className="top-sub">
              Incidents on CER-regulated pipelines and facilities, {meta.minYear} to {dateFmt.format(meta.maxDate)}
            </p>
          </div>
          <div className="top-actions">
            <a className="btn btn-ghost" href={REPO_URL} target="_blank" rel="noreferrer">Risk model &amp; code</a>
            <button
              type="button" className="btn btn-ghost" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      </header>

      {/* ── filters: one row that scopes everything below ── */}
      <div className="filters-wrap">
        <div className="filters-inner">
          {compact && (
            <button type="button" className="btn filters-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              Filters{chips.length ? ` (${chips.length})` : ''} <span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span>
            </button>
          )}
          {(!compact || filtersOpen) && (
            <div className="filters">
              <label className="f f-years">
                <span>Years</span>
                <div className="f-pair">
                  <select value={filters.yearFrom} onChange={(e) => setFilter('yearFrom', e.target.value)} aria-label="From year">
                    <option value="">{meta.minYear}</option>
                    {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span className="f-dash">to</span>
                  <select value={filters.yearTo} onChange={(e) => setFilter('yearTo', e.target.value)} aria-label="To year">
                    <option value="">{meta.maxYear}</option>
                    {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </label>
              <Select label="Province" value={filters.province} onChange={(v) => setFilter('province', v)} options={options.province} all="All provinces" />
              <Select label="Incident type" value={filters.type} onChange={(v) => setFilter('type', v)} options={options.type} all="All types" />
              <Select label="Operator" value={filters.operator} onChange={(v) => setFilter('operator', v)} options={options.operator} all="All operators" />
              <Select label="Cause" value={filters.what} onChange={(v) => setFilter('what', v)} options={options.what} all="All causes" />
              <Select label="Activity" value={filters.activity} onChange={(v) => setFilter('activity', v)} options={options.activity} all="All activities" />
              <label className="f">
                <span>Severity</span>
                <select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
                  <option value="">All incidents</option>
                  <option value="sig">Significant only</option>
                  <option value="not">Not significant</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      <main className="main">
        <div className="status-row">
          <p className="count" aria-live="polite">
            Showing <strong>{fmt(filtered.length)}</strong> of {fmt(records.length)} incidents
          </p>
          <div className="chips">
            {chips.map((c) => (
              <button
                key={c.key} type="button" className="chip"
                onClick={() => setFilters((f) => ({ ...f, ...Object.fromEntries(c.clear.map((k) => [k, ''])) }))}
                aria-label={`Remove filter ${c.label}: ${c.value}`}
              >
                <span className="chip-label">{c.label}:</span> {c.value} <span aria-hidden="true">✕</span>
              </button>
            ))}
            {chips.length > 0 && <button type="button" className="btn btn-link" onClick={clearAll}>Clear all</button>}
            {chips.length > 0 && <button type="button" className="btn btn-link" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link to this view'}</button>}
          </div>
        </div>
        {!compact && chips.length === 0 && (
          <p className="hint">Tip: click any bar to filter the whole dashboard. Click it again to clear.</p>
        )}

        {filtered.length === 0 ? (
          <div className="card empty">
            <p>No incidents match these filters.</p>
            <button type="button" className="btn" onClick={clearAll}>Clear all filters</button>
          </div>
        ) : (
          <>
            <section className="kpis" aria-label="Key figures">
              <Kpi label="Incidents" value={fmt(kpi.total)} sub={chips.length ? 'In this view' : `${meta.minYear} to ${meta.maxYear}`} />
              <Kpi label="Significant" value={fmt(kpi.sig)} sub={`${pct(kpi.rate)} of incidents`} />
              <Kpi label="Fatalities" value={fmt(kpi.fatalities)} sub="People killed" />
              <Kpi label="Injuries" value={fmt(kpi.injuries)} sub="People injured" />
              <Kpi label="Still open" value={fmt(kpi.open)} sub="Not yet closed by the CER" />
            </section>

            {insights.length > 0 && (
              <section className="insights" aria-label="Key findings">
                {insights.map((i) => (
                  <div className="insight" key={i.k}>
                    <div className="insight-k">{i.k}</div>
                    <p>{i.text}</p>
                  </div>
                ))}
              </section>
            )}

            <Card
              title="Incidents per year"
              subtitle="Click a year to focus on it"
              note={meta.partialYear ? `*${meta.partialYear} covers January to ${dateFmt.format(meta.maxDate)} only, so it is not comparable with full years.` : null}
            >
              <YearColumns
                data={view.years} partialYear={meta.partialYear} colors={colors} compact={compact}
                range={{ from: filters.yearFrom, to: filters.yearTo }} onSelect={onYear}
              />
            </Card>

            <div className="grid-2">
              <Card title="What kind of incident" subtitle="Incidents can have more than one type">
                <StackedBars data={view.type} selected={filters.type} onSelect={toggle('type')} colors={colors} labelWidth={labelW} maxChars={chars} />
              </Card>
              <Card title="How often incidents became significant" subtitle="By activity at the time of the incident" legend={false}>
                <RateBars data={view.activity} overall={view.activityBase} selected={filters.activity} onSelect={toggle('activity')} colors={colors} labelWidth={compact ? 90 : 110} />
              </Card>
            </div>

            <div className="grid-2">
              <Card title="Where" subtitle="Incidents by province or territory">
                <StackedBars data={view.province} selected={filters.province} onSelect={toggle('province')} colors={colors} labelWidth={labelW} maxChars={chars} />
              </Card>
              <Card
                title="Operators with the most incidents"
                subtitle="Top 10 operators"
                note="Larger networks report more incidents, so this is not a safety ranking."
              >
                <StackedBars data={view.operator} selected={filters.operator} onSelect={toggle('operator')} colors={colors} labelWidth={labelW} maxChars={chars} />
              </Card>
            </div>

            <div className="grid-2">
              <Card title="What happened" subtitle="Immediate cause; an incident can list several">
                <StackedBars data={view.what} selected={filters.what} onSelect={toggle('what')} colors={colors} labelWidth={labelW} maxChars={chars} />
              </Card>
              <Card title="Why it happened" subtitle="Underlying factors; an incident can list several">
                <StackedBars data={view.why} selected={filters.why} onSelect={toggle('why')} colors={colors} labelWidth={labelW} maxChars={chars} />
              </Card>
            </div>

            <div className="grid-2">
              <Card title="Substance released" subtitle="Top 8, for incidents that involved a substance">
                {view.substance.length
                  ? <StackedBars data={view.substance} selected={filters.substance} onSelect={toggle('substance')} colors={colors} labelWidth={labelW} maxChars={chars} />
                  : <p className="card-empty">No substance recorded for these incidents.</p>}
              </Card>
              <Card
                title="Land use at the incident site"
                subtitle={`Recorded for ${fmt(view.landKnown)} of ${fmt(view.landBase)} incidents`}
                note="Most older records were migrated without a land use value, so they are left out."
              >
                {view.landUse.length
                  ? <StackedBars data={view.landUse} selected={filters.landUse} onSelect={toggle('landUse')} colors={colors} labelWidth={labelW} maxChars={chars} />
                  : <p className="card-empty">No land use recorded for these incidents.</p>}
              </Card>
            </div>

            <IncidentTable rows={filtered} compact={compact} />
          </>
        )}

        <footer className="about">
          <div>
            <h2>About the data</h2>
            <p>
              Source: Canada Energy Regulator,{' '}
              <a href={DATA_URL} target="_blank" rel="noreferrer">Incidents at CER-Regulated Pipelines and Facilities</a>{' '}
              (Open Government Licence – Canada). Records reported up to {dateFmt.format(meta.maxDate)}.
            </p>
            <p>
              <strong>Significant</strong> is the CER&apos;s own classification, covering incidents such as a death, a serious injury,
              a fire or explosion, a rupture or a large release.
            </p>
          </div>
          <div>
            <h2>How to read it</h2>
            <p>
              One incident can have several types and causes, so those charts can add up to more than the incident count.
              Operators listed under more than one legal name (for example NGTL and NOVA Gas Transmission) are combined.
            </p>
            <p>
              Built by Kashif Shafi ·{' '}
              <a href="https://github.com/kashifshafi99" target="_blank" rel="noreferrer">GitHub</a> ·{' '}
              <a href="https://www.linkedin.com/in/kashif-shafi" target="_blank" rel="noreferrer">LinkedIn</a>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Select({ label, value, onChange, options, all }) {
  return (
    <label className="f">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
