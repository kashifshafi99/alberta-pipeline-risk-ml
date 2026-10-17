import { useState, useEffect, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
  LineChart, Line,
  Treemap,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

/* ─── Color Palette ────────────────────────────────────────── */
const COLORS = [
  '#4f7df5', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b',
  '#00d4ff', '#f97316', '#14b8a6', '#6366f1', '#ef4444',
  '#a855f7', '#22d3ee', '#84cc16', '#e879f9', '#fb923c',
];

const PROVINCE_COLORS = {
  'Alberta': '#4f7df5',
  'British Columbia': '#8b5cf6',
  'Ontario': '#ec4899',
  'Saskatchewan': '#10b981',
  'New Brunswick': '#f59e0b',
  'Manitoba': '#00d4ff',
  'Quebec': '#f97316',
  'Nova Scotia': '#14b8a6',
  'Northwest Territories': '#6366f1',
};

const INCIDENT_TYPE_MAP = {
  'Release of Substance': { color: '#4f7df5', shortName: 'Release' },
  'Operation Beyond Design Limits': { color: '#f59e0b', shortName: 'OBDL' },
  'Fire': { color: '#f97316', shortName: 'Fire' },
  'Serious Injury (as defined in the OPR)': { color: '#8b5cf6', shortName: 'Injury' },
  'Adverse Environmental Effects': { color: '#10b981', shortName: 'Adverse Env.' },
  'Explosion': { color: '#ef4444', shortName: 'Explosion' },
  'Fatality': { color: '#ff6b6b', shortName: 'Fatality' },
};

/* ─── Helpers ──────────────────────────────────────────────── */
function getPrimaryIncidentType(types) {
  if (!types) return 'Other';
  const primary = types.split(',')[0].trim();
  for (const key of Object.keys(INCIDENT_TYPE_MAP)) {
    if (primary.includes(key) || types.includes(key)) return key;
  }
  return 'Other';
}

function getTypeBadgeClass(type) {
  if (type.includes('Release')) return 'type-badge-release';
  if (type.includes('Fire') && !type.includes('Fatality')) return 'type-badge-fire';
  if (type.includes('Explosion')) return 'type-badge-explosion';
  if (type.includes('Injury')) return 'type-badge-injury';
  if (type.includes('Operation Beyond')) return 'type-badge-obdl';
  if (type.includes('Adverse')) return 'type-badge-adverse';
  if (type.includes('Fatality')) return 'type-badge-fatality';
  return 'type-badge-default';
}

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

/* ─── Custom Tooltip ───────────────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((entry, i) => (
        <div className="tooltip-item" key={i}>
          <span className="tooltip-dot" style={{ background: entry.color || entry.fill }} />
          <span>{entry.name || entry.dataKey}</span>
          <span className="tooltip-value">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Pie Custom Label ─────────────────────────────────────── */
const renderCustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

/* ─── Treemap Custom Content ───────────────────────────────── */
const TreemapContent = ({ root, depth, x, y, width, height, index, name, value }) => {
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: COLORS[index % COLORS.length], stroke: '#0a0e1a', strokeWidth: 2, opacity: 0.85 }} />
      {width > 60 && height > 40 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 7} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600}>
            {name?.length > 15 ? name.slice(0, 14) + '…' : name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={10}>
            {value}
          </text>
        </>
      )}
    </g>
  );
};

/* ═══════════════════════════════════════════════════════════════
   APP COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Filters */
  const [filters, setFilters] = useState({
    yearFrom: '',
    yearTo: '',
    province: '',
    incidentType: '',
    company: '',
    significant: '',
    substance: '',
    status: '',
  });

  /* Table pagination */
  const [tablePage, setTablePage] = useState(1);
  const TABLE_PAGE_SIZE = 12;

  /* ─── Load CSV ─────────────────────────────────────────── */
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}pipeline-incidents-comprehensive-data.csv`)
      .then(res => res.text())
      .then(csvText => {
        const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        setRawData(result.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading CSV:', err);
        setLoading(false);
      });
  }, []);

  /* ─── Extract filter options ───────────────────────────── */
  const filterOptions = useMemo(() => {
    const years = [...new Set(rawData.map(d => d.Year).filter(Boolean))].sort();
    const provinces = [...new Set(rawData.map(d => d.Province).filter(Boolean))].sort();
    const types = [...new Set(rawData.map(d => getPrimaryIncidentType(d['Incident Types'])).filter(Boolean))].sort();
    const companies = [...new Set(rawData.map(d => d.Company).filter(Boolean))].sort();
    const substances = [...new Set(rawData.map(d => d.Substance).filter(Boolean))].sort();
    return { years, provinces, types, companies, substances };
  }, [rawData]);

  /* ─── Filtered data ────────────────────────────────────── */
  const filteredData = useMemo(() => {
    return rawData.filter(d => {
      if (filters.yearFrom && Number(d.Year) < Number(filters.yearFrom)) return false;
      if (filters.yearTo && Number(d.Year) > Number(filters.yearTo)) return false;
      if (filters.province && d.Province !== filters.province) return false;
      if (filters.incidentType && getPrimaryIncidentType(d['Incident Types']) !== filters.incidentType) return false;
      if (filters.company && d.Company !== filters.company) return false;
      if (filters.significant && d.Significant !== filters.significant) return false;
      if (filters.substance && d.Substance !== filters.substance) return false;
      if (filters.status && d.Status !== filters.status) return false;
      return true;
    });
  }, [rawData, filters]);

  /* ─── KPI Calculations ─────────────────────────────────── */
  const kpis = useMemo(() => {
    const total = filteredData.length;
    const significant = filteredData.filter(d => d.Significant === 'Yes').length;
    const fatalities = filteredData.reduce((sum, d) => {
      const n = parseInt(d['Number of fatalities']);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    const injuries = filteredData.reduce((sum, d) => {
      const n = parseInt(d['Number of individuals injured']);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    const releases = filteredData.filter(d => d['Incident Types']?.includes('Release')).length;
    return { total, significant, fatalities, injuries, releases };
  }, [filteredData]);

  /* ─── Chart Data: Incidents by Year ────────────────────── */
  const yearlyData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      const y = d.Year;
      if (!y) return;
      counts[y] = (counts[y] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
  }, [filteredData]);

  /* ─── Chart Data: By Province ──────────────────────────── */
  const provinceData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      if (d.Province) counts[d.Province] = (counts[d.Province] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, fill: PROVINCE_COLORS[name] || '#6366f1' }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  /* ─── Chart Data: By Incident Type ─────────────────────── */
  const typeData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      const t = getPrimaryIncidentType(d['Incident Types']);
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({
        name: INCIDENT_TYPE_MAP[name]?.shortName || name,
        fullName: name,
        value,
        fill: INCIDENT_TYPE_MAP[name]?.color || '#6366f1',
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  /* ─── Chart Data: Yearly Trend by Type (Stacked Area) ──── */
  const yearlyTrendData = useMemo(() => {
    const yearMap = {};
    filteredData.forEach(d => {
      const y = d.Year;
      if (!y) return;
      if (!yearMap[y]) yearMap[y] = {};
      const t = getPrimaryIncidentType(d['Incident Types']);
      const short = INCIDENT_TYPE_MAP[t]?.shortName || t;
      yearMap[y][short] = (yearMap[y][short] || 0) + 1;
    });
    return Object.entries(yearMap)
      .map(([year, types]) => ({ year, ...types }))
      .sort((a, b) => a.year - b.year);
  }, [filteredData]);

  const trendTypeKeys = useMemo(() => {
    const keys = new Set();
    yearlyTrendData.forEach(d => {
      Object.keys(d).forEach(k => { if (k !== 'year') keys.add(k); });
    });
    return [...keys];
  }, [yearlyTrendData]);

  /* ─── Chart Data: What Happened Category ───────────────── */
  const whatHappenedData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      const cat = d['What happened category'];
      if (cat) {
        const primary = cat.split(',')[0].trim();
        counts[primary] = (counts[primary] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredData]);

  /* ─── Chart Data: Why It Happened Category ─────────────── */
  const whyHappenedData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      const cat = d['Why it happened category'];
      if (cat) {
        const primary = cat.split(',')[0].trim();
        counts[primary] = (counts[primary] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredData]);

  /* ─── Chart Data: Top Companies ────────────────────────── */
  const companyData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      if (d.Company) {
        const short = d.Company.length > 30 ? d.Company.slice(0, 28) + '…' : d.Company;
        counts[short] = (counts[short] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredData]);

  /* ─── Chart Data: Substance ────────────────────────────── */
  const substanceData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      if (d.Substance && d.Substance !== 'Not Applicable') {
        counts[d.Substance] = (counts[d.Substance] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredData]);

  /* ─── Chart Data: Land Use Treemap ─────────────────────── */
  const landUseData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      const lu = d['Land Use'];
      if (lu && !lu.includes('Unknown')) {
        counts[lu] = (counts[lu] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [filteredData]);

  /* ─── Chart Data: Significant vs Not ───────────────────── */
  const significantData = useMemo(() => {
    const yes = filteredData.filter(d => d.Significant === 'Yes').length;
    const no = filteredData.filter(d => d.Significant === 'No').length;
    return [
      { name: 'Significant', value: yes, fill: '#ef4444' },
      { name: 'Non-Significant', value: no, fill: '#4f7df5' },
    ];
  }, [filteredData]);

  /* ─── Chart Data: Pipeline Type ────────────────────────── */
  const pipelineTypeData = useMemo(() => {
    const counts = {};
    filteredData.forEach(d => {
      const pt = d['Pipeline or Facility Type'];
      if (pt) counts[pt] = (counts[pt] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([name]) => name.trim() !== '')
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  /* ─── Table Data ───────────────────────────────────────── */
  const tableData = useMemo(() => {
    const start = (tablePage - 1) * TABLE_PAGE_SIZE;
    return filteredData.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredData, tablePage]);

  const totalPages = Math.ceil(filteredData.length / TABLE_PAGE_SIZE);

  /* ─── Filter Handlers ──────────────────────────────────── */
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setTablePage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ yearFrom: '', yearTo: '', province: '', incidentType: '', company: '', significant: '', substance: '', status: '' });
    setTablePage(1);
  }, []);

  /* ─── Loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <div className="loading-text">Loading pipeline incident data…</div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="dashboard">
      {/* ───── Header ───── */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="header-logo">⚡</div>
          <div className="header-title">
            <h1>Pipeline Incidents Dashboard</h1>
            <p>Canada Energy Regulator — Comprehensive Incident Analytics</p>
          </div>
        </div>
        <div className="header-right">
          <span className="header-badge badge-live">● CER Open Data</span>
          <span className="header-badge badge-count">{filteredData.length.toLocaleString()} Records</span>
        </div>
      </header>

      <main className="dashboard-content">
        {/* ───── KPI Row ───── */}
        <section className="kpi-row">
          <div className="kpi-card">
            <div className="kpi-icon">📊</div>
            <div className="kpi-label">Total Incidents</div>
            <div className="kpi-value">{formatNumber(kpis.total)}</div>
            <div className="kpi-sub">Across all filtered records</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">⚠️</div>
            <div className="kpi-label">Significant</div>
            <div className="kpi-value">{formatNumber(kpis.significant)}</div>
            <div className="kpi-sub">
              <span className="kpi-trend-up">{kpis.total ? ((kpis.significant / kpis.total) * 100).toFixed(1) : 0}%</span>
              of total incidents
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">💀</div>
            <div className="kpi-label">Fatalities</div>
            <div className="kpi-value">{kpis.fatalities}</div>
            <div className="kpi-sub">Reported fatalities</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">🏥</div>
            <div className="kpi-label">Injuries</div>
            <div className="kpi-value">{formatNumber(kpis.injuries)}</div>
            <div className="kpi-sub">Individuals injured</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">🛢️</div>
            <div className="kpi-label">Substance Releases</div>
            <div className="kpi-value">{formatNumber(kpis.releases)}</div>
            <div className="kpi-sub">Release incidents</div>
          </div>
        </section>

        {/* ───── Filter Bar ───── */}
        <section className="filter-bar">
          <div className="filter-group">
            <label className="filter-label">Year From</label>
            <select className="filter-select" value={filters.yearFrom}
              onChange={e => updateFilter('yearFrom', e.target.value)}>
              <option value="">All Years</option>
              {filterOptions.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Year To</label>
            <select className="filter-select" value={filters.yearTo}
              onChange={e => updateFilter('yearTo', e.target.value)}>
              <option value="">All Years</option>
              {filterOptions.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Province</label>
            <select className="filter-select" value={filters.province}
              onChange={e => updateFilter('province', e.target.value)}>
              <option value="">All Provinces</option>
              {filterOptions.provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Incident Type</label>
            <select className="filter-select" value={filters.incidentType}
              onChange={e => updateFilter('incidentType', e.target.value)}>
              <option value="">All Types</option>
              {filterOptions.types.map(t => <option key={t} value={t}>{INCIDENT_TYPE_MAP[t]?.shortName || t}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Company</label>
            <select className="filter-select" value={filters.company}
              onChange={e => updateFilter('company', e.target.value)}>
              <option value="">All Companies</option>
              {filterOptions.companies.map(c => <option key={c} value={c}>{c.length > 40 ? c.slice(0, 38) + '…' : c}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Significant</label>
            <select className="filter-select" value={filters.significant}
              onChange={e => updateFilter('significant', e.target.value)}>
              <option value="">All</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Substance</label>
            <select className="filter-select" value={filters.substance}
              onChange={e => updateFilter('substance', e.target.value)}>
              <option value="">All Substances</option>
              {filterOptions.substances.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="filter-reset-btn" onClick={resetFilters}>✕ Reset</button>
        </section>

        {/* ═══════ CHART ROWS ═══════ */}

        {/* Row 1: Yearly Trend (full width) */}
        <div className="charts-row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Incidents Over Time — Stacked Area</div>
                <div className="chart-subtitle">Yearly breakdown by incident type</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yearlyTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    {trendTypeKeys.map((key, i) => (
                      <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                  <XAxis dataKey="year" tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {trendTypeKeys.map((key, i) => (
                    <Area key={key} type="monotone" dataKey={key} stackId="1"
                      stroke={COLORS[i % COLORS.length]}
                      fill={`url(#grad-${i})`}
                      strokeWidth={2} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 2: Incidents by Year (bar) + Incident Type (donut) + Significant (donut) */}
        <div className="charts-row charts-row-3">
          {/* Bar: Incidents by Year */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Incidents by Year</div>
                <div className="chart-subtitle">Annual incident count</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f7df5" stopOpacity={1} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                  <XAxis dataKey="year" tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Incidents" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut: Incident Types */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Incident Types Distribution</div>
                <div className="chart-subtitle">Primary incident category breakdown</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={105}
                    paddingAngle={2} dataKey="value" labelLine={false} label={renderCustomPieLabel}>
                    {typeData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => <span style={{ color: '#8b95b0', fontSize: 11 }}>{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut: Significant */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Significant vs Non-Significant</div>
                <div className="chart-subtitle">Severity classification</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={significantData} cx="50%" cy="50%" innerRadius={55} outerRadius={105}
                    paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomPieLabel}>
                    {significantData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => <span style={{ color: '#8b95b0', fontSize: 11 }}>{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 3: Province (horizontal bar) + Top Companies (horizontal bar) */}
        <div className="charts-row charts-row-2">
          {/* Province */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Incidents by Province</div>
                <div className="chart-subtitle">Geographic distribution across Canada</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={provinceData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                  <XAxis type="number" tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Incidents" radius={[0, 4, 4, 0]}>
                    {provinceData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Companies */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Top 10 Companies by Incidents</div>
                <div className="chart-subtitle">Highest incident reporters</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                  <XAxis type="number" tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={160} tick={{ fill: '#8b95b0', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Incidents" radius={[0, 4, 4, 0]}>
                    {companyData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 4: What Happened + Why It Happened + Substance */}
        <div className="charts-row charts-row-3">
          {/* What Happened */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">What Happened — Root Cause</div>
                <div className="chart-subtitle">Primary cause categories</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={whatHappenedData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                  <XAxis type="number" tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fill: '#8b95b0', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Incidents" radius={[0, 4, 4, 0]}>
                    {whatHappenedData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Why It Happened */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Why It Happened</div>
                <div className="chart-subtitle">Contributing factor categories</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={whyHappenedData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                  <XAxis type="number" tick={{ fill: '#8b95b0', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fill: '#8b95b0', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Incidents" radius={[0, 4, 4, 0]}>
                    {whyHappenedData.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 5) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Substance Pie */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Released Substances</div>
                <div className="chart-subtitle">Top substances involved (excl. N/A)</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={substanceData} cx="50%" cy="50%" innerRadius={45} outerRadius={95}
                    paddingAngle={2} dataKey="value" labelLine={false} label={renderCustomPieLabel}>
                    {substanceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => <span style={{ color: '#8b95b0', fontSize: 10 }}>{value.length > 20 ? value.slice(0, 18) + '…' : value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 5: Pipeline Type + Land Use Treemap */}
        <div className="charts-row charts-row-2">
          {/* Pipeline Type */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Pipeline / Facility Type</div>
                <div className="chart-subtitle">Infrastructure classification</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pipelineTypeData} cx="50%" cy="50%" innerRadius={50} outerRadius={100}
                    paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomPieLabel}>
                    {pipelineTypeData.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => <span style={{ color: '#8b95b0', fontSize: 11 }}>{value || 'Unknown'}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Land Use Treemap */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Land Use Distribution</div>
                <div className="chart-subtitle">Incident locations by land classification</div>
              </div>
            </div>
            <div className="chart-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap data={landUseData} dataKey="value" nameKey="name"
                  content={<TreemapContent />} animationDuration={300}>
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ═══════ DATA TABLE ═══════ */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Incident Records</div>
              <div className="chart-subtitle">Showing {((tablePage - 1) * TABLE_PAGE_SIZE) + 1}–{Math.min(tablePage * TABLE_PAGE_SIZE, filteredData.length)} of {filteredData.length.toLocaleString()} records</div>
            </div>
          </div>
          <div className="table-wrapper" style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident #</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Province</th>
                  <th>Company</th>
                  <th>Substance</th>
                  <th>Status</th>
                  <th>Significant</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: '#7c8fff' }}>{row['Incident Number']}</td>
                    <td>
                      <span className={`type-badge ${getTypeBadgeClass(row['Incident Types'] || '')}`}>
                        {INCIDENT_TYPE_MAP[getPrimaryIncidentType(row['Incident Types'])]?.shortName || 'Other'}
                      </span>
                    </td>
                    <td>{row['Reported Date']}</td>
                    <td>{row.Province}</td>
                    <td title={row.Company}>{row.Company?.length > 28 ? row.Company.slice(0, 26) + '…' : row.Company}</td>
                    <td>{row.Substance === 'Not Applicable' ? '—' : row.Substance}</td>
                    <td>
                      <span className={`status-pill ${row.Status === 'Closed' ? 'status-closed' : 'status-open'}`}>
                        <span className="status-dot" />
                        {row.Status}
                      </span>
                    </td>
                    <td style={{ color: row.Significant === 'Yes' ? '#ef4444' : '#8b95b0' }}>
                      {row.Significant}
                    </td>
                    <td>{row['Nearest Populated Centre']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="pagination">
            <button className="page-btn" disabled={tablePage <= 1} onClick={() => setTablePage(1)}>⟪</button>
            <button className="page-btn" disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}>←</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (tablePage <= 3) {
                page = i + 1;
              } else if (tablePage >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = tablePage - 2 + i;
              }
              return (
                <button key={page} className={`page-btn ${tablePage === page ? 'active' : ''}`}
                  onClick={() => setTablePage(page)}>
                  {page}
                </button>
              );
            })}
            <span className="page-info">of {totalPages}</span>
            <button className="page-btn" disabled={tablePage >= totalPages} onClick={() => setTablePage(p => p + 1)}>→</button>
            <button className="page-btn" disabled={tablePage >= totalPages} onClick={() => setTablePage(totalPages)}>⟫</button>
          </div>
        </div>
      </main>
    </div>
  );
}
