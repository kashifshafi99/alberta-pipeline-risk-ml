/* Data model: turns raw CER rows into clean records, and the helpers that
   filter and aggregate them. Kept free of React so it is easy to test. */

export const TYPE_LABELS = {
  'Release of Substance': 'Release of substance',
  'Operation Beyond Design Limits': 'Operation beyond design limits',
  'Fire': 'Fire',
  'Serious Injury (as defined in the OPR)': 'Serious injury',
  'Adverse Environmental Effects': 'Adverse environmental effects',
  'Explosion': 'Explosion',
  'Fatality': 'Fatality',
};

export const EMPTY_FILTERS = {
  yearFrom: '', yearTo: '', province: '', type: '', operator: '',
  what: '', why: '', activity: '', substance: '', landUse: '', severity: '',
};

export const FILTER_LABELS = {
  province: 'Province', type: 'Type', operator: 'Operator', what: 'Cause',
  why: 'Factor', activity: 'Activity', substance: 'Substance',
  landUse: 'Land use', severity: 'Severity',
};

export const SEVERITY_LABELS = { sig: 'Significant only', not: 'Not significant' };

const splitList = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

/* The CER lists some operators under several legal names (for example NGTL GP
   Ltd. and NOVA Gas Transmission Ltd. are the same system). Consolidate the
   clear cases so one company is one bar; the legal name stays in the table. */
export function normalizeOperator(name) {
  if (!name) return 'Unknown';
  const n = name.trim();
  if (/^(NGTL GP Ltd|NOVA Gas Transmission)/i.test(n)) return 'NOVA Gas Transmission (NGTL)';
  if (/^Westcoast Energy/i.test(n)) return 'Westcoast Energy (Spectra)';
  if (/^Trans Mountain Pipeline/i.test(n)) return 'Trans Mountain Pipeline';
  if (/^Alliance Pipeline/i.test(n)) return 'Alliance Pipeline';
  if (/^Minell Pipeline/i.test(n)) return 'Minell Pipeline';
  if (/^TransCanada PipeLines Limited/i.test(n)) return 'TransCanada PipeLines';
  return n.replace(/,?\s+(as (agent|general partner)|on behalf of|carrying on business as)\b.*$/i, '');
}

function parseDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || '');
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function toRecord(raw) {
  const date = parseDate(raw['Reported Date']);
  const substance = raw.Substance && raw.Substance !== 'Not Applicable' ? raw.Substance : null;
  const land = raw['Land Use'];
  return {
    id: raw['Incident Number'],
    date,
    time: date ? date.getTime() : 0,
    year: Number(raw.Year) || (date ? date.getFullYear() : 0),
    types: splitList(raw['Incident Types']).map((t) => TYPE_LABELS[t] || t),
    what: splitList(raw['What happened category']),
    why: splitList(raw['Why it happened category']),
    province: raw.Province || 'Unknown',
    operator: normalizeOperator(raw.Company),
    company: raw.Company || '',
    activity: raw['Activity being performed at time of incident'] || '',
    substance,
    landUse: land && !/^Unknown/i.test(land) ? land : null,
    status: raw.Status || '',
    open: raw.Status && raw.Status !== 'Closed',
    sig: raw.Significant === 'Yes',
    fatalities: num(raw['Number of fatalities']),
    injuries: num(raw['Number of individuals injured']),
    place: raw['Nearest Populated Centre'] || '',
    whatDetail: raw['Detailed what happened'] || '',
    whyDetail: raw['Detailed why it happened'] || '',
    volume: raw['Approximate Volume Released (m3)'] || '',
    raw,
  };
}

const MATCHERS = {
  yearFrom: (r, v) => r.year >= Number(v),
  yearTo: (r, v) => r.year <= Number(v),
  province: (r, v) => r.province === v,
  type: (r, v) => r.types.includes(v),
  operator: (r, v) => r.operator === v,
  what: (r, v) => r.what.includes(v),
  why: (r, v) => r.why.includes(v),
  activity: (r, v) => r.activity === v,
  substance: (r, v) => r.substance === v,
  landUse: (r, v) => r.landUse === v,
  severity: (r, v) => (v === 'sig' ? r.sig : !r.sig),
};

/* Apply every active filter except the ones in `exclude`. Charts exclude
   their own dimension so the selected bar stays visible next to the others. */
export function applyFilters(rows, filters, exclude = []) {
  const active = Object.entries(filters).filter(([k, v]) => v !== '' && !exclude.includes(k));
  if (!active.length) return rows;
  return rows.filter((r) => active.every(([k, v]) => MATCHERS[k](r, v)));
}

/* Count incidents per category, split into significant and other.
   With multi=true a record counts once for every category it lists. */
export function tally(rows, keyFn, multi = false) {
  const m = new Map();
  for (const r of rows) {
    const keys = multi ? keyFn(r) : [keyFn(r)];
    for (const k of keys) {
      if (k == null || k === '') continue;
      let e = m.get(k);
      if (!e) { e = { name: String(k), total: 0, sig: 0 }; m.set(k, e); }
      e.total += 1;
      if (r.sig) e.sig += 1;
    }
  }
  return [...m.values()]
    .map((e) => ({ ...e, other: e.total - e.sig, rate: e.total ? e.sig / e.total : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function summarize(rows) {
  let sig = 0, fatalities = 0, injuries = 0, open = 0;
  for (const r of rows) {
    if (r.sig) sig += 1;
    fatalities += r.fatalities;
    injuries += r.injuries;
    if (r.open) open += 1;
  }
  return { total: rows.length, sig, rate: rows.length ? sig / rows.length : 0, fatalities, injuries, open };
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const fmt = (n) => Number(n).toLocaleString('en-CA');
