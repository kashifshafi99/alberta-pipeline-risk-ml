import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList, ReferenceLine,
} from 'recharts';
import { fmt, pct } from './data.js';

/* Colors for SVG marks. SVG attributes can't read CSS variables reliably, so
   the two themes are mirrored here (same values as the tokens in index.css). */
export const THEME_COLORS = {
  light: {
    other: '#2a78d6', sig: '#eb6834', surface: '#fcfcfb', grid: '#e1e0d9',
    axis: '#c3c2b7', tick: '#52514e', label: '#52514e', hover: 'rgba(11,11,11,0.05)',
  },
  dark: {
    other: '#3987e5', sig: '#d95926', surface: '#1a1a19', grid: '#2c2c2a',
    axis: '#383835', tick: '#c3c2b7', label: '#c3c2b7', hover: 'rgba(255,255,255,0.06)',
  },
};

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* Category labels on one line: long names are shortened, full name on hover. */
function CategoryTick({ x, y, payload, fill, maxChars }) {
  const full = String(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text x={-6} y={0} dy={4} textAnchor="end" fill={fill} fontSize={12}>{truncate(full, maxChars)}</text>
    </g>
  );
}

export function Legend() {
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="swatch swatch-sig" />Significant</span>
      <span><i className="swatch swatch-other" />Other incidents</span>
    </div>
  );
}

function StackTip({ active, payload, extra }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-title">{d.name}{extra ? extra(d) : ''}</div>
      <div className="tip-row"><strong>{fmt(d.total)}</strong> incidents</div>
      <div className="tip-row"><i className="tip-key tip-key-sig" /><strong>{fmt(d.sig)}</strong> significant ({pct(d.rate)})</div>
      <div className="tip-hint">Click to filter</div>
    </div>
  );
}

function RateTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-title">{d.name}</div>
      <div className="tip-row"><strong>{pct(d.rate)}</strong> significant</div>
      <div className="tip-row">{fmt(d.sig)} of {fmt(d.total)} incidents</div>
      <div className="tip-hint">Click to filter</div>
    </div>
  );
}

export function Card({ title, subtitle, children, note, legend = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {legend && <Legend />}
      </header>
      {children}
      {note && <p className="card-note">{note}</p>}
    </section>
  );
}

/* Horizontal stacked bars: significant from the baseline, the rest after it.
   Clicking anywhere on a row filters the dashboard to that category. */
export function StackedBars({ data, selected, onSelect, colors, labelWidth = 150, maxChars = 24 }) {
  const height = data.length * 34 + 30;
  const dim = (name) => (selected && selected !== name ? 0.3 : 1);
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data} layout="vertical" barCategoryGap={8}
          margin={{ top: 0, right: 48, bottom: 0, left: 0 }}
          onClick={(s) => s?.activeLabel && onSelect(s.activeLabel)}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid horizontal={false} stroke={colors.grid} />
          <XAxis type="number" tick={{ fill: colors.tick, fontSize: 12 }} axisLine={{ stroke: colors.axis }} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category" dataKey="name" width={labelWidth} interval={0}
            tick={<CategoryTick fill={colors.tick} maxChars={maxChars} />}
            axisLine={{ stroke: colors.axis }} tickLine={false}
          />
          <Tooltip content={<StackTip />} cursor={{ fill: colors.hover }} />
          <Bar dataKey="sig" stackId="s" fill={colors.sig} stroke={colors.surface} strokeWidth={1} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fillOpacity={dim(d.name)} />)}
          </Bar>
          <Bar dataKey="other" stackId="s" fill={colors.other} stroke={colors.surface} strokeWidth={1} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fillOpacity={dim(d.name)} />)}
            <LabelList dataKey="total" position="right" fill={colors.label} fontSize={12} formatter={fmt} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* Columns per year. The last year is drawn lighter when it is incomplete. */
export function YearColumns({ data, partialYear, range, onSelect, colors, compact }) {
  const inRange = (y) => {
    const n = Number(y);
    return (!range.from || n >= Number(range.from)) && (!range.to || n <= Number(range.to));
  };
  const hasRange = Boolean(range.from || range.to);
  const op = (d) => {
    const base = Number(d.name) === partialYear ? 0.45 : 1;
    return hasRange && !inRange(d.name) ? base * 0.3 : base;
  };
  const extra = (d) => (Number(d.name) === partialYear ? ' (partial year)' : '');
  return (
    <div className="chart" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data} barCategoryGap="20%" margin={{ top: 18, right: 8, bottom: 0, left: -8 }}
          onClick={(s) => s?.activeLabel && onSelect(String(s.activeLabel))}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis
            dataKey="name" tick={{ fill: colors.tick, fontSize: 12 }} axisLine={{ stroke: colors.axis }} tickLine={false}
            interval={compact ? 2 : 0} tickFormatter={(v) => (Number(v) === partialYear ? `${v}*` : v)}
          />
          <YAxis tick={{ fill: colors.tick, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<StackTip extra={extra} />} cursor={{ fill: colors.hover }} />
          <Bar dataKey="sig" stackId="y" fill={colors.sig} stroke={colors.surface} strokeWidth={1} maxBarSize={24} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fillOpacity={op(d)} />)}
          </Bar>
          <Bar dataKey="other" stackId="y" fill={colors.other} stroke={colors.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fillOpacity={op(d)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* Share of incidents that were significant, per category, against the
   overall rate. One series, so one color: the significant color. */
export function RateBars({ data, overall, selected, onSelect, colors, labelWidth = 110 }) {
  const height = data.length * 40 + 40;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data} layout="vertical" barCategoryGap={10}
          margin={{ top: 18, right: 92, bottom: 0, left: 0 }}
          onClick={(s) => s?.activeLabel && onSelect(s.activeLabel)}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid horizontal={false} stroke={colors.grid} />
          <XAxis type="number" domain={[0, 1]} tickFormatter={pct} tick={{ fill: colors.tick, fontSize: 12 }} axisLine={{ stroke: colors.axis }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={labelWidth} interval={0} tick={<CategoryTick fill={colors.tick} maxChars={16} />} axisLine={{ stroke: colors.axis }} tickLine={false} />
          <Tooltip content={<RateTip />} cursor={{ fill: colors.hover }} />
          <ReferenceLine
            x={overall} stroke={colors.tick} strokeWidth={1}
            label={{ value: `All: ${pct(overall)}`, position: 'top', fill: colors.label, fontSize: 12 }}
          />
          <Bar dataKey="rate" fill={colors.sig} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fillOpacity={selected && selected !== d.name ? 0.3 : 1} />)}
            <LabelList
              dataKey="rate" position="right" fill={colors.label} fontSize={12}
              content={({ x, y, width, height: h, index }) => {
                const d = data[index];
                return (
                  <text
                    x={x + width + 6} y={y + h / 2} dy={4} fill={colors.label} fontSize={12}
                    stroke={colors.surface} strokeWidth={4} paintOrder="stroke" strokeLinejoin="round"
                  >
                    {`${pct(d.rate)} · n=${fmt(d.total)}`}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
