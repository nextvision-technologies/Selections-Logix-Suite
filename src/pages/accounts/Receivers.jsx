// Saved receivers: the address book every booking fills in. Staff see all of them (Receivers page and
// the customer account page); a merchant sees their own under My Receivers. Admins, the customer's
// branch manager and the user who first saved a receiver can edit it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Contact, Pencil, RefreshCw, Repeat, UserPlus } from 'lucide-react';
import DataTable from '../../components/tables/DataTable.jsx';
import { Card, EmptyState, Modal, PageHeader, PageSkeleton, StatCard, StatusBadge } from '../../components/ui/index.jsx';
import { FormModal, buildSchema } from '../../components/forms/EntityForm.jsx';
import { useAuth } from '../../store/authStore.js';
import { toast } from '../../store/uiStore.js';
import { useScopedShipments } from '../../hooks/useApp.js';
import { CITY_NAMES, ZONES } from '../../data/geo.js';
import { fmtCurrency, fmtDate, maskNationalId, phoneKey } from '../../utils/format.js';
import { listReceivers, updateReceiver } from '../../lib/api.js';

const isThisMonth = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/** Mirrors the server rule; the server still decides. Branch managers only load their branch's receivers. */
const canEdit = (user, r) => ['super_admin', 'branch_manager'].includes(user.role) || (!!r?.created_by && r.created_by === user.id);

function useReceivers(customerId, skip) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    if (skip) { setRows([]); return; }
    listReceivers(customerId).then(setRows).catch((e) => { toast.error(e.message); setRows([]); });
  }, [customerId, skip]);
  useEffect(() => { load(); }, [load]);
  return [rows, load];
}

const columns = (withCustomer) => [
  { key: 'name', header: 'Receiver', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'phone', header: 'Phone', render: (r) => <span className="whitespace-nowrap">{r.phone}{r.alt_phone && <span className="block text-xs text-ink-muted">{r.alt_phone}</span>}</span> },
  { key: 'cnic', header: 'CNIC', value: (r) => r.cnic || '', render: (r) => <span className="font-mono text-xs">{r.cnic ? maskNationalId(r.cnic) : '-'}</span> },
  ...(withCustomer ? [{ key: 'customer', header: 'Customer' }] : []),
  { key: 'city', header: 'City' },
  { key: 'zone', header: 'Zone', value: (r) => r.zone || '-' },
  { key: 'address', header: 'Address', value: (r) => [r.address, r.landmark && `near ${r.landmark}`].filter(Boolean).join(', '), hidden: true },
  { key: 'shipments_count', header: 'Shipments', value: (r) => r.shipments_count || 0, align: 'end' },
  { key: 'last_used_at', header: 'Last used', value: (r) => r.last_used_at || '', render: (r) => fmtDate(r.last_used_at) },
];

const EDIT_FIELDS = [
  { name: 'name', label: 'Full name', required: true, maxLength: 80 },
  { name: 'phone', label: 'Phone', required: true, phone: true },
  { name: 'alt_phone', label: 'Second phone', phone: true },
  { name: 'cnic', label: 'CNIC', required: true, cnic: true },
  { name: 'address', label: 'Complete address', required: true, maxLength: 250, full: true },
  { name: 'landmark', label: 'Nearest landmark', maxLength: 120, full: true },
  { name: 'city', label: 'City', type: 'select', required: true, options: CITY_NAMES },
  {
    name: 'zone', label: 'Zone', type: 'select', required: true, help: 'Must be a zone of the selected city',
    options: Object.entries(ZONES).flatMap(([city, zones]) => zones.map((z) => ({ value: z.value, label: `${city} ${z.side} - ${z.areas}` }))),
  },
];
const editSchema = buildSchema(EDIT_FIELDS).superRefine((v, ctx) => {
  if (v.zone && !(ZONES[v.city] || []).some((z) => z.value === v.zone)) ctx.addIssue({ code: 'custom', path: ['zone'], message: `Choose a zone in ${v.city || 'the selected city'}` });
  if (v.alt_phone && phoneKey(v.alt_phone) === phoneKey(v.phone)) ctx.addIssue({ code: 'custom', path: ['alt_phone'], message: 'Second number must be different from the first' });
});

function EditReceiver({ receiver, onClose, onSaved }) {
  return (
    <FormModal
      open={!!receiver}
      onClose={onClose}
      title={`Edit ${receiver?.name || 'receiver'}`}
      size="lg"
      fields={EDIT_FIELDS}
      schema={editSchema}
      defaultValues={receiver ? EDIT_FIELDS.reduce((o, f) => ({ ...o, [f.name]: receiver[f.name] || '' }), {}) : {}}
      onSubmit={async (values) => {
        try {
          await updateReceiver(receiver.id, values);
          toast.success('Receiver updated');
          onSaved({ ...receiver, ...values });
        } catch (e) { toast.error(e.message); }
      }}
    />
  );
}

/** One receiver's details and every shipment this customer sent to that number. */
function ReceiverShipments({ receiver, onClose, onEdit }) {
  const user = useAuth((s) => s.user);
  const shipments = useScopedShipments();
  const list = useMemo(() => {
    if (!receiver) return [];
    const key = phoneKey(receiver.phone);
    return shipments.filter((s) => s.merchantId === receiver.customer_id && phoneKey(s.receiver?.phone) === key);
  }, [shipments, receiver]);
  if (!receiver) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={receiver.name}
      size="lg"
      footer={canEdit(user, receiver) && <button type="button" className="btn-primary" onClick={() => onEdit(receiver)}><Pencil size={15} aria-hidden /> Edit receiver</button>}
    >
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-ink-muted">Phone</dt><dd>{receiver.phone}{receiver.alt_phone ? ` / ${receiver.alt_phone}` : ''}</dd></div>
        <div><dt className="text-xs text-ink-muted">CNIC</dt><dd className="font-mono">{receiver.cnic ? maskNationalId(receiver.cnic) : '-'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Address</dt><dd>{receiver.address}{receiver.landmark ? ` (near ${receiver.landmark})` : ''}, {receiver.city}{receiver.zone ? ` - ${receiver.zone}` : ''}</dd></div>
        {receiver.customer && user.role !== 'merchant' && <div><dt className="text-xs text-ink-muted">Customer</dt><dd><Link className="link" to={`/accounts/customers/${receiver.customer_id}`}>{receiver.customer}</Link></dd></div>}
        <div><dt className="text-xs text-ink-muted">First saved</dt><dd>{fmtDate(receiver.created_at)}</dd></div>
      </dl>
      <p className="mb-2 text-sm font-semibold">Shipments ({list.length})</p>
      {list.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {list.map((s) => (
            <li key={s.id}>
              <Link to={`/shipments/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-surface">
                <span className="font-mono text-xs">{s.awb}</span>
                <span className="text-ink-muted">{fmtDate(s.createdAt)}</span>
                <span>{s.destCity}</span>
                {s.cod > 0 && <span className="font-semibold text-danger">COD {fmtCurrency(s.cod, s.currency)}</span>}
                <StatusBadge status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg bg-surface p-3 text-sm text-ink-muted">No shipments to this number are loaded.</p>}
    </Modal>
  );
}

/** Table + detail + edit, shared by every place receivers are listed. */
function ReceiverTable({ rows, reload, withCustomer, pageSize, filters, exportName }) {
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <DataTable
        data={rows}
        columns={columns(withCustomer)}
        exportName={exportName}
        dateKey="last_used_at"
        searchPlaceholder="Search name, phone, CNIC..."
        pageSize={pageSize}
        filters={filters}
        onRowClick={setOpen}
        emptyTitle="No receivers yet"
        emptyMessage="Receivers are saved automatically when a shipment is booked."
      />
      <ReceiverShipments receiver={open} onClose={() => setOpen(null)} onEdit={(r) => { setOpen(null); setEditing(r); }} />
      <EditReceiver receiver={editing} onClose={() => setEditing(null)} onSaved={(r) => { setEditing(null); setOpen(r); reload(); }} />
    </>
  );
}

function ReceiverStats({ rows }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <StatCard label="Total receivers" value={rows.length} icon={Contact} />
      <StatCard label="New this month" value={rows.filter((r) => isThisMonth(r.created_at)).length} icon={UserPlus} />
      <StatCard label="Repeat receivers" value={rows.filter((r) => (r.shipments_count || 0) > 1).length} hint="More than one shipment" icon={Repeat} />
    </div>
  );
}

/** Admin / branch manager: receivers of every customer they can see. */
export function ReceiverList() {
  const [rows, load] = useReceivers();
  if (!rows) return <PageSkeleton />;
  const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))].sort();
  const customers = [...new Set(rows.map((r) => r.customer).filter(Boolean))].sort();
  return (
    <div>
      <PageHeader
        title="Receivers"
        subtitle="Saved automatically from every booking, one per customer and phone number."
        actions={<button type="button" className="btn-outline" onClick={load}><RefreshCw size={15} aria-hidden /> Refresh</button>}
      />
      <ReceiverStats rows={rows} />
      <ReceiverTable
        rows={rows}
        reload={load}
        withCustomer
        exportName="receivers"
        filters={[{ key: 'customer', label: 'Customer', options: customers }, { key: 'city', label: 'City', options: cities }]}
      />
    </div>
  );
}

/** Merchant portal: the merchant's own receivers. */
export function MyReceivers() {
  const merchantId = useAuth((s) => s.user.merchantId);
  const [rows, load] = useReceivers(merchantId, !merchantId);
  if (!merchantId) return <EmptyState icon={Contact} title="No customer account" message="This login is not linked to a customer account yet." />;
  if (!rows) return <PageSkeleton />;
  const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))].sort();
  return (
    <div>
      <PageHeader
        title="My Receivers"
        subtitle="People you have sent parcels to. Receivers you added yourself can be edited."
        actions={<button type="button" className="btn-outline" onClick={load}><RefreshCw size={15} aria-hidden /> Refresh</button>}
      />
      <ReceiverStats rows={rows} />
      <ReceiverTable rows={rows} reload={load} exportName="my-receivers" filters={[{ key: 'city', label: 'City', options: cities }]} />
    </div>
  );
}

/** The receivers of one customer, shown on the customer account page. */
export function CustomerReceivers({ customerId }) {
  const [rows, load] = useReceivers(customerId);
  return (
    <Card title={`Receivers (${rows ? rows.length : '...'})`} bodyClass="">
      {!rows && <p className="p-4 text-sm text-ink-muted">Loading...</p>}
      {rows && <ReceiverTable rows={rows} reload={load} pageSize={5} exportName="customer-receivers" />}
    </Card>
  );
}
