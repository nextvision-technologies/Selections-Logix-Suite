// Recharts wrappers with one visual system: thin marks, recessive grid, one axis, legends
// for 2+ series. Categorical order blue, orange, aqua, slate was checked with the dataviz
// colour validator (all pairs clear the CVD and normal-vision floors on the light surface);
// slate is the neutral for "pending" states. Identity is always backed by a legend.
import { useId } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const CHART = { blue: '#2A78D6', orange: '#EB6834', aqua: '#1BAF7A', slate: '#475569' };
const SERIES = [CHART.blue, CHART.orange, CHART.aqua, CHART.slate];
const AXIS = { fontSize: 11, fill: '#64748B' };
const GRID = '#EEF1F6';

function ChartTooltip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-pop backdrop-blur">
      {label !== undefined && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} aria-hidden />
          {p.name}: <span className="font-semibold text-ink">{format ? format(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

const Empty = () => <div className="flex h-full items-center justify-center text-sm text-ink-muted">No data for this selection</div>;

const legendStyle = { fontSize: 12, color: '#334155' };

/** series: [{ key, name, color? }] */
export function BarsChart({ data, xKey = 'name', series, height = 260, format, horizontal, stacked }) {
  if (!data?.length) return <div style={{ height }}><Empty /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={format} />
              <YAxis type="category" dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} width={120} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={12} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={format} />
            </>
          )}
          <Tooltip cursor={{ fill: '#F1F5F9' }} content={<ChartTooltip format={format} />} />
          {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? 'a' : undefined} fill={s.color || SERIES[i]} maxBarSize={26} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} animationDuration={700} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LinesChart({ data, xKey = 'label', series, height = 260, format }) {
  if (!data?.length) return <div style={{ height }}><Empty /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={format} />
          <Tooltip cursor={{ stroke: '#CBD5E1', strokeDasharray: '4 4' }} content={<ChartTooltip format={format} />} />
          {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
          {series.map((s, i) => (
            <Line key={s.key} dataKey={s.key} name={s.name} type="monotone" stroke={s.color || SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} animationDuration={800} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrend({ data, xKey = 'label', dataKey, name, height = 260, format, color = CHART.blue }) {
  const gradientId = `area-${useId().replace(/:/g, '')}`;
  if (!data?.length) return <div style={{ height }}><Empty /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={format} allowDecimals={false} />
          <Tooltip cursor={{ stroke: '#CBD5E1', strokeDasharray: '4 4' }} content={<ChartTooltip format={format} />} />
          <Area dataKey={dataKey} name={name} type="monotone" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, height = 260, format, colors = SERIES }) {
  if (!data?.length) return <div style={{ height }}><Empty /></div>;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="84%" paddingAngle={2} cornerRadius={4} stroke="#fff" strokeWidth={2} animationDuration={800}>
            {data.map((d, i) => <Cell key={d.name} fill={d.color || colors[i % colors.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip format={format} />} />
          <Legend
            wrapperStyle={legendStyle}
            iconType="circle"
            iconSize={8}
            formatter={(value, entry) => `${value} (${total ? Math.round((entry.payload.value / total) * 100) : 0}%)`}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
