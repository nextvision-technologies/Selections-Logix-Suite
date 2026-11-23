import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeftRight, Building2, CheckSquare, Clock, Pencil, Phone, Plus, Square, Trash2, User, Wallet, X } from 'lucide-react';
import DataTable from '../../components/tables/DataTable.jsx';
import { Card, KV, PageHeader, StatCard, StatusBadge, Tabs } from '../../components/ui/index.jsx';
import { FormModal } from '../../components/forms/EntityForm.jsx';
import { RecordNotFound } from '../../components/layout/Fallbacks.jsx';
import { AreaTrend } from '../../components/charts/index.jsx';
import { useAuth } from '../../store/authStore.js';
import { useData } from '../../store/dataStore.js';
import { confirm, toast } from '../../store/uiStore.js';
import { useLookups, useMoney } from '../../hooks/useApp.js';
import { BRANCH_TYPES, CITY_NAMES } from '../../data/geo.js';
import { branchStats, dailySeries, riderStats } from '../../data/helpers.js';
import { fmtNumber, fmtPct } from '../../utils/format.js';
import { shipmentColumns } from '../shipments/columns.jsx';
import { syncFromDb } from '../../hooks/useDbSync.js';
import { deleteBranch } from '../../lib/api.js';

const BRANCH_FIELDS = [
  { name: 'name', label: 'Branch name', required: true, full: true },
  { name: 'code', label: 'Code', required: true },
  { name: 'type', label: 'Type', type: 'select', options: BRANCH_TYPES, required: true },
  { name: 'city', label: 'City', type: 'select', options: CITY_NAMES, required: true },
  { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, default: 'Active' },
  { name: 'address', label: 'Address', required: true, full: true },
  { name: 'manager', label: 'Manager', required: true },
  { name: 'phone', label: 'Phone', required: true, phone: true },
  { name: 'hours', label: 'Working hours', required: true, placeholder: '09:00 - 18:00' },
  { name: 'targetShipments', label: 'Target shipments', type: 'number', min: 0 },
];

export function BranchList() {
  const navigate = useNavigate();
  const { compact } = useMoney();
  const user = useAuth((s) => s.user);
  const { branches, shipments, codTransactions, riders, addItem } = useData();
  const [adding, setAdding] = useState(false);
  // Multi-delete (Super Admin): pick cards, then delete them through the server one by one.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const stats = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, branchStats(b.id, shipments, codTransactions)])), [branches, shipments, codTransactions]);
  const visible = user.role === 'branch_manager' ? branches.filter((b) => b.id === user.branchId) : branches;
  const isAdmin = user.role === 'super_admin';
  const toggle = (id) => setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };
  // A branch that still has parcels or riders is kept: deleting it would orphan them.
  const blockedBy = (b) => {
    const parts = [];
    if (stats[b.id]?.total) parts.push(`${stats[b.id].total} shipments`);
    const r = riders.filter((x) => x.branchId === b.id).length;
    if (r) parts.push(`${r} riders`);
    return parts.join(', ');
  };

  const deleteSelected = async () => {
    const chosen = visible.filter((b) => selected.has(b.id));
    const blocked = chosen.filter((b) => blockedBy(b));
    const deletable = chosen.filter((b) => !blockedBy(b));
    if (!deletable.length) {
      toast.error(`Cannot delete: ${blocked.map((b) => `${b.name} (${blockedBy(b)})`).join('; ')}. Set them Inactive instead.`);
      return;
    }
    const ok = await confirm({
      title: `Delete ${deletable.length} branch${deletable.length === 1 ? '' : 'es'}?`,
      message: `${deletable.map((b) => b.name).join(', ')} will be removed permanently.${blocked.length ? ` Skipped because they are in use: ${blocked.map((b) => b.name).join(', ')}.` : ''}`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleting(true);
    const failed = [];
    let done = 0;
    for (const b of deletable) {
      try { await deleteBranch(b.id); done += 1; } catch (e) { failed.push(`${b.name}: ${e.message?.includes('foreign key') ? 'still in use' : e.message}`); }
    }
    setDeleting(false);
    stopSelecting();
    await syncFromDb().catch(() => {});
    if (done) toast.success(`${done} branch${done === 1 ? '' : 'es'} deleted`);
    if (failed.length) toast.error(`Not deleted: ${failed.join('; ')}`);
  };

  const headerActions = isAdmin && (selecting ? (
    <>
      <button type="button" className="btn-outline" onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((b) => b.id)))}>
        {selected.size === visible.length ? <><Square size={15} aria-hidden /> Clear all</> : <><CheckSquare size={15} aria-hidden /> Select all</>}
      </button>
      <button type="button" className="btn-ghost" onClick={stopSelecting} disabled={deleting}><X size={15} aria-hidden /> Cancel</button>
      <button type="button" className="btn-danger" onClick={deleteSelected} disabled={!selected.size || deleting}><Trash2 size={15} aria-hidden /> {deleting ? 'Deleting...' : `Delete selected (${selected.size})`}</button>
    </>
  ) : (
    <>
      {visible.length > 0 && <button type="button" className="btn-outline" onClick={() => setSelecting(true)}><CheckSquare size={15} aria-hidden /> Select</button>}
      <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> Add branch</button>
    </>
  ));

  return (
    <div>
      <PageHeader title="Branches" subtitle={selecting ? `${selected.size} of ${visible.length} selected. Click cards to select them.` : `${visible.length} locations across the network`} actions={headerActions} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => (selecting ? toggle(b.id) : navigate(`/branches/${b.id}`))}
            aria-pressed={selecting ? selected.has(b.id) : undefined}
            className={clsx('card card-hover relative p-4 text-start sm:p-5', selecting && selected.has(b.id) && 'border-danger ring-2 ring-danger/40')}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              {selecting && (
                <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2', selected.has(b.id) ? 'border-danger bg-danger text-white' : 'border-slate-300 bg-white')} aria-hidden>
                  {selected.has(b.id) && <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{b.name}</p>
                <p className="text-xs text-ink-muted">{b.code} - {b.type}</p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <p className="mb-3 line-clamp-1 text-xs text-ink-muted">{b.address}</p>
            {selecting && blockedBy(b) && <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">In use ({blockedBy(b)}): will be skipped</p>}
            <div className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
              <div><p className="text-lg font-bold">{stats[b.id]?.total || 0}</p><p className="text-[11px] text-ink-muted">Shipments</p></div>
              <div><p className="text-lg font-bold">{riders.filter((r) => r.branchId === b.id).length}</p><p className="text-[11px] text-ink-muted">Riders</p></div>
              <div><p className="text-lg font-bold">{compact(stats[b.id]?.cash || 0)}</p><p className="text-[11px] text-ink-muted">Cash</p></div>
            </div>
          </button>
        ))}
      </div>
      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add branch"
        fields={BRANCH_FIELDS}
        onSubmit={(v) => {
          const id = v.code.split('-')[0].toUpperCase() + (branches.some((b) => b.id === v.code.split('-')[0].toUpperCase()) ? branches.length : '');
          addItem('branches', { ...v, id, targetRevenue: 50000, commissionPct: 0, cash: 0, targetShipments: v.targetShipments || 0 }, 'Branch', `${v.name} added`);
          setAdding(false);
          toast.success(`${v.name} added`);
        }}
      />
    </div>
  );
}

export function BranchDetail() {
  const { id } = useParams();
  const { money, compact } = useMoney();
  const lookups = useLookups();
  const user = useAuth((s) => s.user);
  const { branches, shipments, codTransactions, riders, users, updateItem } = useData();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const branch = branches.find((b) => b.id === id);
  const stats = useMemo(() => branchStats(id, shipments, codTransactions), [id, shipments, codTransactions]);
  const daily = useMemo(() => dailySeries(stats.list, 14), [stats.list]);
  const columns = useMemo(() => shipmentColumns({ money, lookups, compact: true }), [money, lookups]);
  if (!branch || (user.role === 'branch_manager' && user.branchId !== id)) return <RecordNotFound what="Branch" backTo="/branches" backLabel="Back to branches" />;

  const branchRiders = riders.filter((r) => r.branchId === id);
  const staff = users.filter((u) => u.branchId === id);
  const last30 = stats.list.filter((s) => Date.now() - new Date(s.createdAt) < 30 * 86400000).length;
  const targetPct = branch.targetShipments ? Math.min((last30 / branch.targetShipments) * 100, 100) : 0;
  const del = async () => {
    if (stats.total > 0 || branchRiders.length > 0) { toast.error(`Cannot delete: ${stats.total} shipments and ${branchRiders.length} riders are linked. Set it to Inactive instead.`); return; }
    if (await confirm({ title: 'Delete branch?', message: `${branch.name} will be removed.`, confirmLabel: 'Delete' })) {
      try {
        await deleteBranch(id);
        await syncFromDb().catch(() => {});
        toast.success('Branch deleted');
        navigate('/branches');
      } catch (e) {
        toast.error(e.message?.includes('foreign key') ? 'Branch is still in use. Set it Inactive instead.' : e.message);
      }
    }
  };

  return (
    <div>
      <PageHeader
        title={branch.name}
        subtitle={`${branch.code} - ${branch.type} - ${branch.city}`}
        actions={(
          <>
            <button type="button" className="btn-outline" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden /> Edit</button>
            {user.role === 'super_admin' && <button type="button" className="btn-danger" onClick={del}><Trash2 size={15} aria-hidden /> Delete</button>}
          </>
        )}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shipments" value={fmtNumber(stats.total)} icon={Building2} />
        <StatCard label="Delivered %" value={fmtPct(stats.deliveredPct)} icon={Clock} />
        <StatCard label="Cash in hand" value={compact(stats.cash)} hint="Not yet reconciled" icon={Wallet} tone={stats.cash > 0 ? 'danger' : 'default'} />
        <StatCard label="Revenue" value={compact(stats.revenue)} icon={ArrowLeftRight} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'staff', label: 'Staff', count: staff.length },
          { value: 'riders', label: 'Riders', count: branchRiders.length },
          { value: 'shipments', label: 'Shipments', count: stats.total },
        ]}
      />
      {tab === 'overview' && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Card title="Details">
            <dl className="grid gap-3">
              <KV label="Address">{branch.address}</KV>
              <KV label="Manager"><span className="inline-flex items-center gap-1"><User size={13} aria-hidden /> {branch.manager}</span></KV>
              <KV label="Phone"><span className="inline-flex items-center gap-1"><Phone size={13} aria-hidden /> {branch.phone}</span></KV>
              <KV label="Working hours">{branch.hours}</KV>
              <KV label="Status"><StatusBadge status={branch.status} /></KV>
            </dl>
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-1 flex justify-between text-xs"><span className="font-medium">30-day target</span><span>{last30} / {branch.targetShipments}</span></p>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.round(targetPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Target progress"><div className="h-full bg-primary-hover" style={{ width: `${targetPct}%` }} /></div>
            </div>
          </Card>
          <Card title="Daily shipments" className="lg:col-span-2"><AreaTrend data={daily} dataKey="shipments" name="Shipments" /></Card>
        </div>
      )}
      {tab === 'staff' && (
        <DataTable data={staff} exportName={`staff-${id}`} columns={[{ key: 'name', header: 'Name' }, { key: 'email', header: 'Email' }, { key: 'role', header: 'Role', value: (u) => u.role.replace('_', ' ') }, { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} />, value: (u) => u.status }]} />
      )}
      {tab === 'riders' && (
        <DataTable
          data={branchRiders}
          exportName={`riders-${id}`}
          onRowClick={(r) => navigate(`/riders/${r.id}`)}
          columns={[
            { key: 'name', header: 'Rider' },
            { key: 'zone', header: 'Zone' },
            { key: 'vehicle', header: 'Vehicle' },
            { key: 'delivered', header: 'Delivered', align: 'right', value: (r) => riderStats(r, shipments, codTransactions).delivered },
            { key: 'cash', header: 'Cash in hand', align: 'right', value: (r) => riderStats(r, shipments, codTransactions).cash, render: (r) => money(riderStats(r, shipments, codTransactions).cash, r.currency) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
          ]}
        />
      )}
      {tab === 'shipments' && <DataTable columns={columns} data={stats.list} exportName={`shipments-${id}`} onRowClick={(s) => navigate(`/shipments/${s.id}`)} />}
      <FormModal
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${branch.name}`}
        fields={BRANCH_FIELDS}
        defaultValues={branch}
        onSubmit={(v) => { updateItem('branches', id, v, 'Branch', `${v.name} edited`); setEditing(false); toast.success('Branch updated'); }}
      />
    </div>
  );
}

