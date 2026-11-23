// Role-wise dashboards. All figures come from the shared selectors in data/helpers.js,
// so they match the lists they link to. Every role gets the same hero banner (greeting,
// today's bookings, quick actions) above its own figures.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Banknote, CheckCircle2, Clock, CreditCard, FileSpreadsheet, HandCoins, Hourglass, PackageCheck, PackageOpen, PackagePlus, RotateCcw,
  Scale, ScanLine, ShieldCheck, TrendingUp, Truck, Users, Wallet, Waypoints,
} from 'lucide-react';
import { useAuth } from '../../store/authStore.js';
import { useData } from '../../store/dataStore.js';
import { useActiveBranch, useBranchFilter, useLookups, useMoney, useScopedShipments } from '../../hooks/useApp.js';
import { Card, StatCard, StatusBadge } from '../../components/ui/index.jsx';
import { AreaTrend, BarsChart, CHART, DonutChart, LinesChart } from '../../components/charts/index.jsx';
import { ROLE_LABELS } from '../../data/config.js';
import { dailySeries, merchantStats, riderStats, shipmentKpis, statusMix, topBy } from '../../data/helpers.js';
import { fmtCompact, fmtCurrency, fmtDate, fmtNumber, fmtPct, isoDay, sum, toPKR } from '../../utils/format.js';
import { NDR_GROUP, STATUS } from '../../utils/status.js';

// Status mix colours follow meaning: delivered aqua, moving blue, problems orange, pending neutral.
const MIX_COLORS = { Delivered: CHART.aqua, 'In network': CHART.blue, 'Failed / RTO / Cancelled': CHART.orange, 'Booked (pending)': CHART.slate };
const withMixColors = (mix) => mix.map((m) => ({ ...m, color: MIX_COLORS[m.name] }));

/** Grid whose children fade up one after another (delays come from .stagger in index.css). */
const Stagger = ({ className, children }) => <div className={clsx('stagger', className)}>{children}</div>;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Decorative route graphic for the hero banner. */
function RouteArt() {
  return (
    <svg viewBox="0 0 320 180" className="pointer-events-none absolute end-2 bottom-0 hidden h-full w-auto opacity-90 sm:block" aria-hidden>
      <defs>
        <linearGradient id="hero-route" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FACC15" stopOpacity="0" /><stop offset=".5" stopColor="#FACC15" /><stop offset="1" stopColor="#FACC15" stopOpacity=".2" /></linearGradient>
      </defs>
      <circle cx="250" cy="40" r="90" fill="#2563EB" opacity=".18" />
      <circle cx="300" cy="150" r="60" fill="#FACC15" opacity=".12" />
      <path d="M10 150 C 80 150, 90 70, 160 80 S 250 40, 300 30" fill="none" stroke="url(#hero-route)" strokeWidth="3" strokeDasharray="7 7" />
      <g className="animate-float">
        <rect x="186" y="78" width="54" height="44" rx="8" fill="#FACC15" />
        <path d="M186 92h54M213 78v44" stroke="#0B1530" strokeWidth="2.5" opacity=".55" />
        <rect x="204" y="70" width="18" height="12" rx="3" fill="#FDE68A" />
      </g>
      <g>
        <circle cx="300" cy="30" r="10" fill="#EF4444" />
        <circle cx="300" cy="30" r="4" fill="#fff" />
        <circle cx="10" cy="150" r="6" fill="#fff" opacity=".7" />
      </g>
    </svg>
  );
}

const QUICK_ACTIONS = {
  super_admin: [['/shipments/new', 'Create Shipment', PackagePlus], ['/accounts/customers', 'Customers', Users], ['/riders/dispatch', 'Dispatch Board', Waypoints]],
  branch_manager: [['/shipments/new', 'Create Shipment', PackagePlus], ['/bulk?tab=booking', 'Bulk import', FileSpreadsheet], ['/riders/dispatch', 'Dispatch Board', Waypoints]],
  accountant: [['/finance/reconciliation', 'Reconcile deposits', Scale], ['/finance/payouts', 'Merchant payouts', HandCoins]],
  merchant: [['/shipments/new', 'Create Shipment', PackagePlus], ['/bulk?tab=booking', 'Bulk import', FileSpreadsheet], ['/portal/payouts', 'Request payout', HandCoins]],
  rider: [['/rider-app', "Start Today's Run", Truck]],
  warehouse: [['/shipments/scan', 'Open Parcel Scan', ScanLine], ['/bulk?tab=status', 'Bulk status update', FileSpreadsheet]],
};

function Hero({ user }) {
  const list = useScopedShipments();
  const today = isoDay(new Date());
  const bookedToday = useMemo(() => list.filter((s) => isoDay(s.createdAt) === today).length, [list, today]);
  const actions = QUICK_ACTIONS[user.role] || [];
  return (
    <section className="relative mb-5 animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-[#12204A] via-[#0B1530] to-[#070D1F] p-5 text-white shadow-lift sm:p-7">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:18px_18px]" />
      <RouteArt />
      <div className="relative max-w-2xl">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-primary ring-1 ring-white/15">
          <ShieldCheck size={13} aria-hidden /> {ROLE_LABELS[user.role]}
        </p>
        <h1 className="mt-3 text-2xl text-white sm:text-[32px] sm:leading-tight">{greeting()}, {user.name.split(' ')[0]}</h1>
        <p className="mt-1.5 text-sm text-slate-300">
          {fmtDate(new Date())} · <span className="font-semibold text-white">{fmtNumber(bookedToday)}</span> shipment{bookedToday === 1 ? '' : 's'} booked today
        </p>
        {actions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {actions.map(([to, label, Icon], i) => (
              <Link
                key={to}
                to={to}
                className={i === 0
                  ? 'btn-primary'
                  : 'btn border border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/20'}
              >
                <Icon size={16} aria-hidden /> {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RecentShipments({ list, limit = 6 }) {
  const { money } = useMoney();
  const rows = useMemo(() => [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit), [list, limit]);
  return (
    <Card title="Recent Shipments" bodyClass="" actions={<Link to="/shipments" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">View all <ArrowUpRight size={13} aria-hidden /></Link>}>
      {rows.length ? (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-muted">
              <tr>{['AWB', 'Receiver', 'Route', 'COD', 'Status'].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2.5 text-start font-semibold sm:px-5">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-line/70 transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 sm:px-5"><Link className="font-mono text-[13px] font-semibold text-ink hover:text-blue-600" to={`/shipments/${s.id}`}>{s.awb}</Link></td>
                  <td className="whitespace-nowrap px-4 py-3 sm:px-5">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{(s.receiver.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                      {s.receiver.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted sm:px-5">{s.originCity} <ArrowRight size={12} className="inline" aria-label="to" /> {s.destCity}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular sm:px-5">{s.cod > 0 ? money(s.cod, s.currency) : <span className="text-ink-muted">-</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 sm:px-5"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-5 py-10 text-center text-sm text-ink-muted">No shipments yet.</p>}
    </Card>
  );
}

/** Things that need someone's attention. A zero reads as "all clear", not as an alarm. */
function AlertsPanel({ items }) {
  const open = items.filter((a) => a.value && a.value !== 0 && a.value !== '0');
  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-line/80 px-4 py-3.5 sm:px-5">
        <h2 className="flex items-center gap-2 text-[15px]">
          <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', open.length ? 'bg-danger-light text-danger' : 'bg-emerald-100 text-emerald-600')}>
            {open.length ? <AlertTriangle size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
          </span>
          Needs attention
        </h2>
        <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', open.length ? 'bg-danger-light text-danger-dark' : 'bg-emerald-100 text-emerald-800')}>{open.length ? `${open.length} open` : 'All clear'}</span>
      </header>
      <ul className="flex-1 divide-y divide-line/70">
        {items.map((a) => {
          const hot = a.value && a.value !== 0 && a.value !== '0';
          return (
            <li key={a.label}>
              <Link to={a.to} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5">
                <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', hot ? 'bg-danger ring-4 ring-danger-light' : 'bg-emerald-600 ring-4 ring-emerald-100')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm"><b className={clsx('font-brand tabular', hot ? 'text-danger-dark' : 'text-ink')}>{a.value}</b> {a.label}</span>
                  {a.hint && <span className="block truncate text-xs text-ink-muted">{a.hint}</span>}
                </span>
                <ArrowRight size={15} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AdminDashboard() {
  const { money, compact, value, currency } = useMoney();
  const navigate = useNavigate();
  const list = useScopedShipments();
  const { merchantName, branchName, riderName } = useLookups();
  const { riderDeposits } = useData();
  const deposits = useBranchFilter(riderDeposits);
  const k = useMemo(() => shipmentKpis(list), [list]);
  const daily = useMemo(() => dailySeries(list, 21).map((d) => ({ ...d, revenue: Math.round(value(d.revenue)), cost: Math.round(value(d.cost)) })), [list, value]);
  const mix = useMemo(() => statusMix(list), [list]);
  const topBranches = useMemo(() => topBy(list, (s) => s.originBranchId, branchName), [list, branchName]);
  const topMerchants = useMemo(() => topBy(list, (s) => s.merchantId, merchantName), [list, merchantName]);
  const riderPerf = useMemo(() => topBy(list.filter((s) => s.status === STATUS.DELIVERED), (s) => s.riderId, riderName), [list, riderName]);
  const unreconciled = deposits.filter((d) => d.status === 'Pending');
  const unreconciledAmt = sum(unreconciled, (d) => toPKR(d.deposited, d.currency));

  return (
    <>
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <StatCard label="Total Shipments" value={fmtNumber(k.total)} icon={PackageCheck} tone="blue" onClick={() => navigate('/shipments')} />
        <StatCard label="Delivered" value={fmtPct(k.deliveredPct)} hint={`${k.delivered} delivered`} icon={CheckCircle2} tone="green" />
        <StatCard label="Returned (RTO)" value={fmtPct(k.rtoPct)} hint={`${k.rto} returned`} icon={RotateCcw} tone="danger" onClick={() => navigate('/shipments')} />
        <StatCard label="COD Collected" value={compact(k.codCollected)} icon={Banknote} onClick={() => navigate('/finance')} />
        <StatCard label="COD Pending" value={compact(k.codPending)} hint="Undelivered + with riders" icon={Hourglass} tone="violet" />
        <StatCard label="Revenue" value={compact(k.revenue)} hint="Excl. tax" icon={CreditCard} tone="blue" />
        <StatCard label="Profit" value={compact(k.profit)} hint={`Margin ${fmtPct(k.revenue ? (k.profit / k.revenue) * 100 : 0)}`} icon={TrendingUp} tone="green" />
      </Stagger>

      <Stagger className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Daily Shipments" className="xl:col-span-2"><AreaTrend data={daily} dataKey="shipments" name="Shipments" /></Card>
        <AlertsPanel
          items={[
            { label: 'delayed shipments', value: k.delayed, hint: 'Past ETA and still moving', to: '/shipments' },
            { label: 'failed deliveries', value: k.failed, hint: 'Need a re-attempt decision', to: '/shipments' },
            { label: 'unreconciled deposits', value: unreconciled.length, hint: `${money(unreconciledAmt)} awaiting accountant`, to: '/finance/reconciliation' },
            { label: 'COD with riders', value: k.codWithRiders ? money(k.codWithRiders) : 0, hint: 'Collected, not deposited', to: '/finance/reconciliation' },
          ]}
        />
      </Stagger>

      <Stagger className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Revenue vs Cost" className="xl:col-span-2">
          <LinesChart data={daily} format={(v) => fmtCompact(v, currency)} series={[{ key: 'revenue', name: 'Revenue', color: CHART.blue }, { key: 'cost', name: 'Cost', color: CHART.orange }]} />
        </Card>
        <Card title="Status Mix"><DonutChart data={withMixColors(mix)} /></Card>
      </Stagger>

      <Stagger className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Top Branches"><BarsChart data={topBranches} horizontal height={220} series={[{ key: 'value', name: 'Shipments' }]} /></Card>
        <Card title="Top Merchants"><BarsChart data={topMerchants} horizontal height={220} series={[{ key: 'value', name: 'Shipments' }]} /></Card>
        <Card title="Rider Performance"><BarsChart data={riderPerf} horizontal height={220} series={[{ key: 'value', name: 'Delivered', color: CHART.aqua }]} /></Card>
      </Stagger>

      <div className="mt-4 animate-fade-up"><RecentShipments list={list} /></div>
    </>
  );
}

function BranchDashboard() {
  const { money, compact } = useMoney();
  const branchId = useActiveBranch();
  const list = useScopedShipments();
  const { branchName, riderName } = useLookups();
  const { riders, codTransactions, riderDeposits } = useData();
  const k = useMemo(() => shipmentKpis(list), [list]);
  const daily = useMemo(() => dailySeries(list, 14), [list]);
  const branchRiders = branchId === 'ALL' ? riders : riders.filter((r) => r.branchId === branchId);
  const txns = branchId === 'ALL' ? codTransactions : codTransactions.filter((x) => x.branchId === branchId);
  const cash = sum(txns.filter((x) => ['Collected', 'Deposited'].includes(x.status)), (x) => toPKR(x.amount, x.currency));
  const atHub = list.filter((s) => s.status === STATUS.DEST && !s.riderId).length;
  const ndr = list.filter((s) => NDR_GROUP.includes(s.status)).length;
  const pending = (branchId === 'ALL' ? riderDeposits : riderDeposits.filter((d) => d.branchId === branchId)).filter((d) => d.status === 'Pending').length;
  const perf = useMemo(() => topBy(list.filter((s) => s.status === STATUS.DELIVERED), (s) => s.riderId, riderName), [list, riderName]);
  return (
    <>
      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm ring-1 ring-line">
        <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden /> {branchId === 'ALL' ? 'All Branches' : branchName(branchId)}
      </p>
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total Shipments" value={fmtNumber(k.total)} icon={PackageCheck} tone="blue" />
        <StatCard label="Delivered" value={fmtPct(k.deliveredPct)} icon={CheckCircle2} tone="green" />
        <StatCard label="Cash in hand" value={compact(cash)} hint="Collected and deposited, not yet reconciled" icon={Wallet} />
        <StatCard label="Active riders" value={`${branchRiders.filter((r) => r.status !== 'On Leave').length} / ${branchRiders.length}`} icon={Truck} tone="violet" />
      </Stagger>
      <Stagger className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Daily Shipments" className="xl:col-span-2"><AreaTrend data={daily} dataKey="shipments" name="Shipments" /></Card>
        <AlertsPanel items={[
          { label: 'parcels awaiting a rider', value: atHub, to: '/riders/dispatch' },
          { label: 'failed or re-attempt', value: ndr, to: '/shipments' },
          { label: 'delayed shipments', value: k.delayed, to: '/shipments' },
          { label: 'deposits pending', value: pending, hint: `${money(cash)} in hand`, to: '/branches' },
        ]}
        />
      </Stagger>
      <Stagger className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Rider Performance"><BarsChart data={perf} horizontal height={240} series={[{ key: 'value', name: 'Delivered', color: CHART.aqua }]} /></Card>
        <div className="xl:col-span-2"><RecentShipments list={list} /></div>
      </Stagger>
    </>
  );
}

function AccountantDashboard() {
  const { money, compact } = useMoney();
  const navigate = useNavigate();
  const { shipments, riderDeposits, payouts } = useData();
  const { merchantName } = useLookups();
  const k = useMemo(() => shipmentKpis(shipments), [shipments]);
  const pendingDeposits = riderDeposits.filter((d) => d.status === 'Pending');
  const diffs = pendingDeposits.filter((d) => d.deposited !== d.expected);
  const pendingPayouts = payouts.filter((p) => ['Pending', 'Approved'].includes(p.status));
  const flow = [
    { name: 'With riders', value: k.codWithRiders, color: CHART.orange },
    { name: 'Deposited', value: k.codDeposited, color: CHART.blue },
    { name: 'Reconciled', value: k.codReconciled, color: CHART.slate },
    { name: 'Paid out', value: k.codPaid, color: CHART.aqua },
  ];
  return (
    <>
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="COD Collected" value={compact(k.codCollected)} icon={Banknote} onClick={() => navigate('/finance')} />
        <StatCard label="With riders" value={compact(k.codWithRiders)} hint="Collected, not deposited" icon={Wallet} tone={k.codWithRiders > 0 ? 'danger' : 'default'} onClick={() => navigate('/finance/reconciliation')} />
        <StatCard label="Payable to merchants" value={compact(k.codReconciled)} hint="Reconciled COD" icon={HandCoins} tone="blue" onClick={() => navigate('/finance/payouts')} />
        <StatCard label="Paid out" value={compact(k.codPaid)} icon={CheckCircle2} tone="green" onClick={() => navigate('/finance/payouts')} />
      </Stagger>
      <Stagger className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="COD pipeline" className="xl:col-span-2"><DonutChart data={flow} format={(v) => money(v)} /></Card>
        <AlertsPanel items={[
          { label: 'deposits to reconcile', value: pendingDeposits.length, hint: `${diffs.length} with a shortage or excess`, to: '/finance/reconciliation' },
          { label: 'payouts awaiting action', value: pendingPayouts.length, hint: money(sum(pendingPayouts, (p) => p.net)), to: '/finance/payouts' },
        ]}
        />
      </Stagger>
      <div className="mt-4 animate-fade-up">
        <Card title="Payouts awaiting action" bodyClass="">
          <ul className="divide-y divide-line/70">
            {pendingPayouts.slice(0, 6).map((po) => (
              <li key={po.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-slate-50 sm:px-5">
                <span className="flex items-center gap-2.5 font-medium">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-800"><HandCoins size={15} aria-hidden /></span>
                  {merchantName(po.merchantId)}
                </span>
                <span className="text-xs text-ink-muted"><StatusBadge status={po.status} /> {fmtDate(po.createdAt)}</span>
                <span className="font-brand font-bold tabular">{money(po.net)}</span>
              </li>
            ))}
            {!pendingPayouts.length && <li className="px-4 py-10 text-center text-sm text-ink-muted">Nothing waiting</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

function MerchantDashboard() {
  const navigate = useNavigate();
  const { compact } = useMoney();
  const user = useAuth((s) => s.user);
  const { shipments, codTransactions, payouts } = useData();
  const stats = useMemo(() => merchantStats(user.merchantId, shipments, codTransactions, payouts), [user, shipments, codTransactions, payouts]);
  const k = stats.kpis;
  const daily = useMemo(() => dailySeries(stats.list, 14), [stats.list]);
  const mix = useMemo(() => statusMix(stats.list), [stats.list]);
  return (
    <>
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total Shipments" value={fmtNumber(k.total)} icon={PackageCheck} tone="blue" onClick={() => navigate('/shipments')} />
        <StatCard label="Delivered" value={fmtPct(k.deliveredPct)} hint={`RTO ${fmtPct(k.rtoPct)}`} icon={CheckCircle2} tone="green" />
        <StatCard label="Payable COD" value={compact(stats.payable)} hint={`${compact(stats.inTransit)} in collection`} icon={Wallet} onClick={() => navigate('/portal/cod')} />
        <StatCard label="Paid out" value={compact(stats.paid)} hint="COD paid to you so far" icon={HandCoins} tone="violet" onClick={() => navigate('/portal/payouts')} />
      </Stagger>
      <Stagger className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Daily Shipments" className="xl:col-span-2"><AreaTrend data={daily} dataKey="shipments" name="Shipments" /></Card>
        <Card title="Status Mix"><DonutChart data={withMixColors(mix)} /></Card>
      </Stagger>
      <div className="mt-4 animate-fade-up"><RecentShipments list={stats.list} /></div>
    </>
  );
}

// The rider record arrives from the database just after sign-in; wait for it instead of crashing.
function RiderDashboard() {
  const user = useAuth((s) => s.user);
  const rider = useData((s) => s.riders.find((r) => r.id === user.riderId));
  if (!rider) return <Card><p className="text-sm text-ink-muted">{user.riderId ? 'Loading your rider profile...' : 'This login is not linked to a rider record. Ask the Super Admin to check your account.'}</p></Card>;
  return <RiderDashboardFor rider={rider} />;
}

function RiderDashboardFor({ rider }) {
  const navigate = useNavigate();
  const { shipments, codTransactions } = useData();
  const stats = riderStats(rider, shipments, codTransactions);
  const mine = shipments.filter((s) => s.riderId === rider.id);
  const pickups = shipments.filter((s) => s.pickupRiderId === rider.id && s.status === STATUS.BOOKED);
  const daily = useMemo(() => dailySeries(mine, 14), [mine]);
  return (
    <>
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Deliveries" value={stats.active} hint="Assigned today" icon={Truck} tone="blue" onClick={() => navigate('/rider-app')} />
        <StatCard label="Pickups" value={pickups.length} icon={PackageOpen} tone="violet" onClick={() => navigate('/rider-app')} />
        <StatCard label="Cash in hand" value={fmtCurrency(stats.cash, rider.currency)} icon={Wallet} tone={stats.cash > 0 ? 'danger' : 'default'} onClick={() => navigate('/rider-app')} />
        <StatCard label="Success rate" value={fmtPct(stats.successPct)} hint={`${stats.delivered} delivered`} icon={CheckCircle2} tone="green" />
      </Stagger>
      <div className="mt-4 animate-fade-up"><Card title="Daily Shipments"><AreaTrend data={daily} dataKey="shipments" name="Parcels" height={220} /></Card></div>
    </>
  );
}

function WarehouseDashboard() {
  const navigate = useNavigate();
  const list = useScopedShipments();
  const count = (st) => list.filter((x) => x.status === st).length;
  const toPick = count(STATUS.BOOKED);
  const atOrigin = count(STATUS.ORIGIN);
  const atDest = count(STATUS.DEST);
  const transit = count(STATUS.TRANSIT);
  const stages = [
    { name: 'Picked up', value: count(STATUS.PICKED) },
    { name: 'At origin hub', value: count(STATUS.ORIGIN) },
    { name: 'In transit', value: transit },
    { name: 'At destination hub', value: atDest },
    { name: 'Out for delivery', value: count(STATUS.OFD) },
  ];
  return (
    <>
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting pickup" value={toPick} icon={Clock} tone="violet" onClick={() => navigate('/shipments')} />
        <StatCard label="At origin hub" value={atOrigin} hint="To sort and send out" icon={PackageCheck} tone="blue" onClick={() => navigate('/shipments/scan')} />
        <StatCard label="In transit" value={transit} icon={Truck} />
        <StatCard label="At destination hub" value={atDest} hint="To hand to riders" icon={PackageOpen} tone="green" onClick={() => navigate('/shipments/scan')} />
      </Stagger>
      <div className="mt-4 animate-fade-up"><Card title="Parcels by stage"><BarsChart data={stages} height={240} series={[{ key: 'value', name: 'Parcels' }]} /></Card></div>
      <div className="mt-4 animate-fade-up"><RecentShipments list={list} /></div>
    </>
  );
}

const VIEWS = {
  super_admin: AdminDashboard,
  branch_manager: BranchDashboard,
  accountant: AccountantDashboard,
  merchant: MerchantDashboard,
  rider: RiderDashboard,
  warehouse: WarehouseDashboard,
};

export function Dashboard() {
  const user = useAuth((s) => s.user);
  const View = VIEWS[user.role];
  return (
    <div>
      <Hero user={user} />
      <View />
    </div>
  );
}
