// Bulk import: download template -> upload CSV / Excel -> every row checked in a preview ->
// valid rows imported one by one through the same server actions as the single forms (so the
// server's rules and permissions still apply) -> summary with a downloadable error report.
// Each kind only supplies its columns, checks and how one row is saved.
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Square, Upload, XCircle,
} from 'lucide-react';
import { Card, FileDropzone, PageHeader, Tabs } from '../../components/ui/index.jsx';
import { useAuth } from '../../store/authStore.js';
import { useData } from '../../store/dataStore.js';
import { toast } from '../../store/uiStore.js';
import { useScopedShipments } from '../../hooks/useApp.js';
import { syncFromDb } from '../../hooks/useDbSync.js';
import { CITY_MAP, ZONES } from '../../data/geo.js';
import { NEXT_STATUS, SHIPMENT_STATUSES } from '../../utils/status.js';
import { PAYMENT_TERMS, PRODUCT_TYPES, SERVICES, SHIPPING_PLANS, paymentTermLabel } from '../../utils/pricing.js';
import { CNIC_RE, isEmail, isNtn, isPhone } from '../../utils/validation.js';
import { formatCnic, phoneKey } from '../../utils/format.js';
import { downloadText, parseSpreadsheet } from '../../utils/export.js';
import { saveCustomer, savePricing, saveReceiver } from '../../lib/api.js';

const MAX_ROWS = 500;
const str = (v) => String(v ?? '').trim();
const num = (v) => (str(v) === '' ? NaN : Number(str(v).replace(/,/g, '')));
const list = (v) => str(v).split(/[|;,/]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const err = (error) => ({ error });
const warn = (warning) => ({ warning });

// Payment types a bulk file can use. Debit is paid at the counter at booking, so it stays single.
const BULK_TERMS = ['cod', 'topay', 'credit'];
const SERVICE_VALUES = SERVICES.map((s) => s.value);

const zoneFor = (city, value) => {
  const v = str(value).toLowerCase();
  if (!v) return null;
  return (ZONES[city] || []).find((z) => z.value.toLowerCase() === v || z.side.toLowerCase() === v) || null;
};
const productTypeFor = (value) => {
  const v = str(value).toLowerCase();
  return PRODUCT_TYPES.find((p) => p.value === v || p.label.toLowerCase() === v) || null;
};
const cnicOf = (v) => {
  const s = str(v);
  return /^\d{13}$/.test(s) ? formatCnic(s) : s;
};

// ---------------------------------------------------------------- import kinds
const KINDS = {
  booking: {
    label: 'Bulk booking',
    roles: ['super_admin', 'branch_manager', 'merchant'],
    intro: 'Book many shipments for one customer account. Sender details come from the account\'s default pickup address.',
    template: 'bulk-booking-template',
    needsCustomer: true,
    columns: [
      { key: 'receiver_name', label: 'Receiver', required: true, check: (v) => (str(v).length >= 2 && str(v).length <= 80 ? null : err('Name must be 2-80 characters')) },
      {
        key: 'receiver_phone', label: 'Phone', required: true,
        check: (v, row, ctx) => {
          if (!isPhone(str(v))) return err('Invalid phone (use 0300 1234567 or +92 300 1234567)');
          if (ctx.sender && phoneKey(v) === phoneKey(ctx.sender.phone)) return err('Same as the sender phone');
          return null;
        },
      },
      { key: 'receiver_alt_phone', label: 'Second phone', check: (v, row) => (!str(v) ? null : !isPhone(str(v)) ? err('Invalid phone') : phoneKey(v) === phoneKey(row.receiver_phone) ? err('Same as the first phone') : null) },
      { key: 'receiver_cnic', label: 'CNIC', required: true, check: (v) => (CNIC_RE.test(cnicOf(v)) ? null : err('CNIC must be 13 digits: 35202-1234567-1')) },
      { key: 'receiver_address', label: 'Address', required: true, check: (v) => (str(v).length >= 5 ? null : err('Address is too short')) },
      { key: 'receiver_landmark', label: 'Landmark', check: (v) => (str(v).length <= 120 ? null : err('At most 120 characters')) },
      { key: 'receiver_city', label: 'City', required: true, check: (v) => (CITY_MAP[str(v)] ? null : err('Unknown city (e.g. Lahore, Karachi, Islamabad)')) },
      { key: 'receiver_zone', label: 'Zone', check: (v, row) => (!str(v) ? warn('No zone given') : CITY_MAP[str(row.receiver_city)] && !zoneFor(str(row.receiver_city), v) ? err(`Not a zone of ${str(row.receiver_city)} (e.g. North, Central)`) : null) },
      { key: 'product_type', label: 'Product type', check: (v) => (!str(v) || productTypeFor(v) ? null : err('Unknown product type')) },
      { key: 'item_name', label: 'Item', required: true, check: (v) => (str(v) ? null : err('Item name is required')) },
      { key: 'qty', label: 'Qty', check: (v) => (!str(v) || (Number.isInteger(num(v)) && num(v) >= 1) ? null : err('Whole number, 1 or more')) },
      { key: 'unit_price', label: 'Unit price', check: (v) => (!str(v) || num(v) >= 0 ? null : err('0 or more')) },
      { key: 'weight_kg', label: 'Weight', required: true, check: (v) => { const n = num(v); if (!(n > 0)) return err('Weight must be above 0'); if (n > 1000) return err('Above 1000 kg: book as Cargo'); return n > 30 ? warn('Over 30 kg: check the weight') : null; } },
      { key: 'pieces', label: 'Pieces', check: (v) => (!str(v) || (Number.isInteger(num(v)) && num(v) >= 1 && num(v) <= 50) ? null : err('1 to 50')) },
      { key: 'service', label: 'Service', check: (v) => (!str(v) || SERVICE_VALUES.includes(str(v).toLowerCase()) ? null : err(`Use one of: ${SERVICE_VALUES.join(', ')}`)) },
      {
        key: 'payment_type', label: 'Payment', required: true,
        check: (v, row, ctx) => {
          const t = str(v).toLowerCase().replace(/[\s_-]/g, '');
          if (t === 'debit') return err('Debit is paid at the counter: book it from Create Shipment');
          if (!BULK_TERMS.includes(t)) return err('Use cod, topay or credit');
          if (ctx.terms.length && !ctx.terms.includes(t)) return err(`Not enabled on this account (allowed: ${ctx.terms.map(paymentTermLabel).join(', ')})`);
          return null;
        },
      },
      { key: 'cod_amount', label: 'COD', check: (v, row) => { const cod = str(row.payment_type).toLowerCase() === 'cod'; const n = num(v); if (cod && !(n > 0)) return err('COD amount is required for COD'); if (!cod && str(v) && n > 0) return warn('Ignored: not a COD booking'); return n > 100000 ? warn('High COD amount') : null; } },
      { key: 'notes', label: 'Instructions', check: (v) => (str(v).length <= 300 ? null : err('At most 300 characters')) },
    ],
    sample: [
      { receiver_name: 'Sara Ahmed', receiver_phone: '0300 1234567', receiver_alt_phone: '', receiver_cnic: '35202-1234567-1', receiver_address: 'House 12, Street 4, Model Town', receiver_landmark: 'Near Jamia Masjid', receiver_city: 'Lahore', receiver_zone: 'Central', product_type: 'clothing', item_name: 'Cotton kurta', qty: 2, unit_price: 1500, weight_kg: 1.2, pieces: 1, service: 'next-day', payment_type: 'cod', cod_amount: 3000, notes: 'Call before delivery' },
      { receiver_name: 'Ahmed Khan', receiver_phone: '+92 321 7654321', receiver_alt_phone: '', receiver_cnic: '4210112345671', receiver_address: 'Flat 4, Clifton Block 2', receiver_landmark: '', receiver_city: 'Karachi', receiver_zone: 'South', product_type: 'parcel', item_name: 'Books', qty: 1, unit_price: 800, weight_kg: 0.5, pieces: 1, service: 'economy', payment_type: 'topay', cod_amount: '', notes: '' },
    ],
    // One row becomes the same form the Create Shipment screen sends.
    run: async (row, ctx) => {
      const city = str(row.receiver_city);
      const qty = num(row.qty) || 1;
      const price = num(row.unit_price) || 0;
      const term = str(row.payment_type).toLowerCase().replace(/[\s_-]/g, '');
      const rule = PAYMENT_TERMS.find((t) => t.value === term);
      const crossBorder = CITY_MAP[ctx.sender.city]?.country !== CITY_MAP[city]?.country;
      const planService = SHIPPING_PLANS.find((p) => p.value === ctx.plan)?.service;
      const receiver = {
        phone: str(row.receiver_phone), altPhone: str(row.receiver_alt_phone), name: str(row.receiver_name), cnic: cnicOf(row.receiver_cnic),
        address: str(row.receiver_address), landmark: str(row.receiver_landmark), city, zone: zoneFor(city, row.receiver_zone)?.value || '',
      };
      const form = {
        merchantId: ctx.customer.id, plan: ctx.plan, payTerm: ctx.terms.length ? term : '',
        sender: ctx.sender, receiver,
        productType: productTypeFor(row.product_type)?.value || 'parcel',
        items: [{ name: str(row.item_name), sku: '', qty, unit: 'Pcs', value: price, hsCode: '' }],
        pieces: num(row.pieces) || 1, weight: num(row.weight_kg), length: 0, width: 0, height: 0, declaredValue: qty * price, packaging: 'none',
        service: crossBorder ? 'international' : planService || str(row.service).toLowerCase() || 'next-day',
        courier: 'Selections Express', paymentType: rule.paymentType, cod: rule.paymentType === 'cod' ? num(row.cod_amount) : 0,
        insurance: false, notes: str(row.notes) || 'Bulk import',
        payment: rule.method ? { method: rule.method, channel: '', reference: '', received: 0, change: 0 } : null,
      };
      const shipment = await ctx.createShipment(form);
      // Keep the receiver in the address book, like a single booking does. A failure here is not fatal.
      saveReceiver(ctx.customer.id, receiver).catch(() => {});
      return shipment.awb;
    },
  },

  status: {
    label: 'Status update',
    roles: ['super_admin', 'branch_manager', 'warehouse'],
    intro: 'Move many parcels to a new status, e.g. after a hub scan list or a delivery sheet.',
    template: 'bulk-status-template',
    columns: [
      { key: 'awb', label: 'AWB', required: true, check: (v, row, ctx) => (ctx.byAwb[str(v).toUpperCase()] ? null : err('AWB not found in your view')) },
      {
        key: 'status', label: 'New status', required: true,
        check: (v, row, ctx) => {
          const st = SHIPMENT_STATUSES.find((x) => x.toLowerCase() === str(v).toLowerCase());
          if (!st) return err('Unknown status');
          const s = ctx.byAwb[str(row.awb).toUpperCase()];
          if (s && !NEXT_STATUS[s.status]?.includes(st)) return err(`Cannot go from "${s.status}" to "${st}"`);
          return null;
        },
      },
      { key: 'note', label: 'Note', check: (v) => (str(v).length <= 300 ? null : err('At most 300 characters')) },
    ],
    sample: [{ awb: 'SLX100001', status: 'Picked Up', note: 'Collected from merchant' }],
    run: async (row, ctx) => {
      const s = ctx.byAwb[str(row.awb).toUpperCase()];
      const status = SHIPMENT_STATUSES.find((x) => x.toLowerCase() === str(row.status).toLowerCase());
      const res = await ctx.changeStatus([s.id], status, { note: str(row.note) || 'Bulk update' });
      if (!res.ok) throw new Error('Not allowed for your role, or the status changed meanwhile');
      return `${s.awb} -> ${status}`;
    },
  },

  customers: {
    label: 'Customers',
    roles: ['super_admin', 'branch_manager'],
    intro: 'Create customer accounts with their main pickup address. Logins, documents and bank details are added later on each account.',
    template: 'bulk-customers-template',
    columns: [
      { key: 'business_name', label: 'Business', required: true, check: (v, row, ctx) => (str(v).length < 2 ? err('Business name is required') : ctx.names.has(str(v).toLowerCase()) ? warn('A customer with this name already exists') : null) },
      { key: 'owner_name', label: 'Owner', required: true, check: (v) => (/^[\p{L}][\p{L} .'-]{1,79}$/u.test(str(v)) ? null : err('Letters only, 2-80 characters')) },
      { key: 'phone', label: 'Phone', required: true, check: (v) => (isPhone(str(v)) ? null : err('Invalid phone')) },
      { key: 'email', label: 'Email', check: (v) => (!str(v) || isEmail(v) ? null : err('Invalid email')) },
      { key: 'cnic', label: 'CNIC', check: (v) => (!str(v) || CNIC_RE.test(cnicOf(v)) ? null : err('CNIC must be 13 digits')) },
      { key: 'ntn', label: 'NTN', check: (v) => (!str(v) || isNtn(v) ? null : err('NTN must be 1234567-8')) },
      { key: 'city', label: 'City', required: true, check: (v) => (CITY_MAP[str(v)] ? null : err('Unknown city')) },
      { key: 'branch', label: 'Branch', check: (v, row, ctx) => (ctx.fixedBranch || !str(v) || ctx.branchFor(v) ? null : err('Unknown branch (use the branch code, e.g. LHE)')) },
      { key: 'office_address', label: 'Office address' },
      { key: 'pickup_address', label: 'Pickup address', required: true, check: (v) => (str(v).length >= 5 ? null : err('Pickup address is required')) },
      { key: 'pickup_city', label: 'Pickup city', required: true, check: (v) => (CITY_MAP[str(v)] ? null : err('Unknown city')) },
      { key: 'payment_types', label: 'Payment types', required: true, check: (v) => { const l = list(v); return l.length && l.every((x) => PAYMENT_TERMS.some((t) => t.value === x)) ? null : err('Use cod, topay, credit, debit (separate with |)'); } },
      { key: 'shipping_plans', label: 'Plans', check: (v) => (list(v).every((x) => SHIPPING_PLANS.some((p) => p.value === x)) ? null : err('Use cod, ftl, corporate, cargo (separate with |)')) },
      { key: 'discount_pct', label: 'Discount %', check: (v) => (!str(v) || (num(v) >= 0 && num(v) <= 100) ? null : err('0 to 100')) },
      { key: 'credit_limit', label: 'Credit limit', check: (v) => (!str(v) || num(v) >= 0 ? null : err('0 or more')) },
    ],
    sample: [{ business_name: 'Zaryab Fashion House', owner_name: 'Zaryab Ali', phone: '0300 1112233', email: 'zaryab@example.com', cnic: '35202-1234567-1', ntn: '', city: 'Lahore', branch: 'LHE', office_address: '12 Main Boulevard, Gulberg', pickup_address: 'Warehouse 8, Industrial Estate', pickup_city: 'Lahore', payment_types: 'cod|topay', shipping_plans: 'cod', discount_pct: 5, credit_limit: 0 }],
    run: async (row, ctx) => {
      const branchId = ctx.fixedBranch || ctx.branchFor(row.branch)?.id || CITY_MAP[str(row.city)]?.branchId || null;
      const id = await saveCustomer({
        customer: {
          business_name: str(row.business_name), owner_name: str(row.owner_name), phone: str(row.phone), email: str(row.email),
          cnic: str(row.cnic) ? cnicOf(row.cnic) : '', ntn: str(row.ntn), city: str(row.city), branch_id: branchId, office_address: str(row.office_address),
          payment_types: list(row.payment_types), shipping_plans: list(row.shipping_plans),
          discount_pct: num(row.discount_pct) || 0, credit_limit: num(row.credit_limit) || 0,
        },
        pickups: [{ label: 'Main pickup', address: str(row.pickup_address), city: str(row.pickup_city), phone: str(row.phone), return_same_as_pickup: true }],
      });
      return id;
    },
  },

  rates: {
    label: 'Rate card',
    roles: ['super_admin'],
    intro: 'Update the first-0.5 kg price per zone and service. Zones not in the file keep their current prices. Existing shipments keep their booked price.',
    template: 'bulk-rate-card-template',
    columns: [
      { key: 'zone', label: 'Zone', required: true, check: (v) => (['A', 'B', 'C', 'X'].includes(str(v).toUpperCase()) ? null : err('Use A, B, C or X')) },
      ...[['same_day', 'Same day'], ['next_day', 'Next day'], ['economy', 'Economy'], ['international', 'International']].map(([key, label]) => (
        { key, label, required: true, check: (v) => (num(v) >= 0 ? null : err('0 or more')) }
      )),
    ],
    sample: [
      { zone: 'A', same_day: 250, next_day: 180, economy: 140, international: 0 },
      { zone: 'B', same_day: 420, next_day: 260, economy: 200, international: 0 },
    ],
    // All rows are saved together as one rate card.
    runAll: async (rows, ctx) => {
      const byZone = Object.fromEntries(rows.map((r) => [str(r.zone).toUpperCase(), r]));
      const card = {
        ...ctx.rateCard,
        zones: ctx.rateCard.zones.map((z) => (byZone[z.id]
          ? { ...z, sameDay: num(byZone[z.id].same_day), nextDay: num(byZone[z.id].next_day), economy: num(byZone[z.id].economy), international: num(byZone[z.id].international) }
          : z)),
      };
      await savePricing(card);
      ctx.setValue('rateCard', card, 'Rate Card', `Bulk import: ${rows.length} zone(s)`);
    },
  },
};

// ---------------------------------------------------------------- checking
const normKey = (k) => String(k).trim().toLowerCase().replace(/[\s-]+/g, '_');

function checkRows(kind, rows, ctx) {
  const def = KINDS[kind];
  const seen = new Map();
  return rows.map((raw, i) => {
    const row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normKey(k), v]));
    const cells = {};
    def.columns.forEach((c) => {
      const value = row[c.key];
      if (c.required && !str(value)) cells[c.key] = err(`${c.label} is required`);
      else if (c.check) { const r = c.check(value, row, ctx); if (r) cells[c.key] = r; }
    });
    // The same receiver twice in one booking file, or the same AWB twice, is almost always a mistake.
    const dupKey = kind === 'booking' ? phoneKey(row.receiver_phone) : kind === 'status' ? str(row.awb).toUpperCase() : kind === 'rates' ? str(row.zone).toUpperCase() : '';
    if (dupKey) {
      if (seen.has(dupKey)) {
        const key = kind === 'booking' ? 'receiver_phone' : kind === 'status' ? 'awb' : 'zone';
        if (!cells[key]) cells[key] = kind === 'booking' ? warn(`Same receiver as row ${seen.get(dupKey)}`) : err(`Duplicate of row ${seen.get(dupKey)}`);
      } else seen.set(dupKey, i + 1);
    }
    const hasError = Object.values(cells).some((c) => c.error);
    const hasWarning = Object.values(cells).some((c) => c.warning);
    return { n: i + 1, row, cells, hasError, hasWarning };
  });
}

// ---------------------------------------------------------------- wizard
function ImportWizard({ kind, ctx, disabledReason }) {
  const def = KINDS[kind];
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({}); // n -> { ok, ref, message }
  const stopRef = useRef(false);

  const checked = useMemo(() => (rows ? checkRows(kind, rows, ctx) : []), [rows, kind, ctx]);
  const valid = checked.filter((r) => !r.hasError);
  const done = Object.keys(results).length > 0 && !running;
  const imported = Object.values(results).filter((r) => r.ok).length;
  const failed = Object.values(results).filter((r) => !r.ok).length;
  const shown = onlyProblems ? checked.filter((r) => r.hasError || r.hasWarning || results[r.n]?.ok === false) : checked;

  const downloadTemplate = () => {
    const keys = def.columns.map((c) => c.key);
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [keys.join(','), ...def.sample.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
    downloadText(`﻿${csv}`, `${def.template}.csv`, 'text/csv');
  };

  const onFiles = async ([f]) => {
    try {
      const parsed = (await parseSpreadsheet(f)).filter((r) => Object.values(r).some((v) => str(v)));
      if (!parsed.length) { toast.error('The file has no rows'); return; }
      if (parsed.length > MAX_ROWS) { toast.error(`At most ${MAX_ROWS} rows per file. Split the file and import it in parts.`); return; }
      const headers = new Set(Object.keys(parsed[0]).map(normKey));
      const missing = def.columns.filter((c) => c.required && !headers.has(c.key)).map((c) => c.key);
      if (missing.length) { toast.error(`Missing columns: ${missing.join(', ')}. Download the template to see the expected columns.`); return; }
      setFile(f.name);
      setRows(parsed);
      setResults({});
      setOnlyProblems(false);
    } catch (e) {
      toast.error(e.message || 'Could not read the file');
    }
  };

  const reset = () => { setFile(null); setRows(null); setResults({}); };

  const runImport = async () => {
    if (!valid.length) return;
    setRunning(true);
    stopRef.current = false;
    if (def.runAll) {
      try {
        await def.runAll(valid.map((r) => r.row), ctx);
        setResults(Object.fromEntries(valid.map((r) => [r.n, { ok: true, ref: 'Saved' }])));
        toast.success(`${valid.length} row(s) saved`);
      } catch (e) {
        setResults(Object.fromEntries(valid.map((r) => [r.n, { ok: false, message: e.message }])));
        toast.error(e.message);
      }
      setRunning(false);
      return;
    }
    let ok = 0;
    for (const r of valid) {
      if (stopRef.current) break;
      if (results[r.n]?.ok) continue; // already imported in an earlier run of this file
      try {
        const ref = await def.run(r.row, ctx);
        ok += 1;
        setResults((x) => ({ ...x, [r.n]: { ok: true, ref } }));
      } catch (e) {
        setResults((x) => ({ ...x, [r.n]: { ok: false, message: e.message || 'Failed' } }));
      }
    }
    setRunning(false);
    syncFromDb().catch(() => {});
    toast.success(`${ok} row(s) imported${stopRef.current ? ' (stopped)' : ''}`);
  };

  const downloadReport = () => {
    const keys = def.columns.map((c) => c.key);
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const problems = checked.filter((r) => r.hasError || results[r.n]?.ok === false);
    const lines = problems.map((r) => {
      const reasons = [
        ...Object.entries(r.cells).filter(([, c]) => c.error).map(([k, c]) => `${k}: ${c.error}`),
        ...(results[r.n]?.ok === false ? [results[r.n].message] : []),
      ];
      return [r.n, ...keys.map((k) => esc(r.row[k])), esc(reasons.join('; '))].join(',');
    });
    downloadText(`﻿${['row', ...keys, 'error'].join(',')}\n${lines.join('\n')}`, `${def.template.replace('template', 'errors')}.csv`, 'text/csv');
  };

  const progress = valid.length ? Math.round((Object.keys(results).length / valid.length) * 100) : 0;
  const errorRows = checked.filter((r) => r.hasError).length;
  const warnRows = checked.filter((r) => !r.hasError && r.hasWarning).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['1', 'Download the template', 'Fill one row per record. Keep the column names.', <button key="t" type="button" className="btn-outline btn-sm mt-2" onClick={downloadTemplate}><Download size={14} aria-hidden /> Template (.csv)</button>],
            ['2', 'Upload your file', 'CSV or Excel (.xlsx), up to 500 rows.', null],
            ['3', 'Check and import', 'Rows with errors are skipped. Fix them in the file and upload again.', null],
          ].map(([n, t, d, action]) => (
            <div key={n} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-brand text-sm font-bold">{n}</span>
              <div><p className="font-semibold">{t}</p><p className="text-xs text-ink-muted">{d}</p>{action}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-muted">
          Columns: <code className="break-words text-ink">{def.columns.map((c) => `${c.key}${c.required ? '*' : ''}`).join(', ')}</code> <span className="whitespace-nowrap">(* required)</span>
        </p>
      </Card>

      {disabledReason ? (
        <p className="rounded-2xl bg-primary-light px-4 py-3 text-sm">{disabledReason}</p>
      ) : !rows ? (
        <FileDropzone onFiles={onFiles} accept=".csv,.xlsx,.xls" hint="Drop your CSV or Excel file here, or click to browse" />
      ) : (
        <Card
          title={<span className="flex items-center gap-2"><FileSpreadsheet size={16} aria-hidden /> {file}</span>}
          bodyClass=""
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{checked.length} rows</span>
              <span className="chip !bg-emerald-100 !text-emerald-800">{valid.length} ready</span>
              {errorRows > 0 && <span className="chip !bg-danger-light !text-danger-dark">{errorRows} with errors</span>}
              {warnRows > 0 && <span className="chip !bg-amber-100 !text-amber-800">{warnRows} warnings</span>}
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="h-3.5 w-3.5 accent-primary-hover" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only problems</label>
            </div>
          )}
        >
          {(running || done) && (
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <div className="mb-1.5 flex justify-between text-xs font-medium">
                <span>{running ? 'Importing... keep this page open' : `Done: ${imported} imported, ${failed} failed`}</span>
                <span className="tabular">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          <div className="scroll-thin max-h-[480px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">#</th>
                  <th className="px-3 py-2 text-start font-semibold">Result</th>
                  {def.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 text-start font-semibold">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const res = results[r.n];
                  return (
                    <tr key={r.n} className="border-t border-line/70 align-top">
                      <td className="px-3 py-2 text-ink-muted">{r.n}</td>
                      <td className="min-w-[150px] px-3 py-2">
                        {res?.ok && <span className="flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 size={13} aria-hidden /> {res.ref}</span>}
                        {res && !res.ok && <span className="flex items-start gap-1 font-medium text-danger-dark"><XCircle size={13} className="mt-px shrink-0" aria-hidden /> {res.message}</span>}
                        {!res && r.hasError && <span className="flex items-center gap-1 font-medium text-danger-dark"><XCircle size={13} aria-hidden /> Skipped</span>}
                        {!res && !r.hasError && <span className={clsx('flex items-center gap-1 font-medium', r.hasWarning ? 'text-amber-700' : 'text-ink-muted')}>{r.hasWarning ? <AlertTriangle size={13} aria-hidden /> : <CheckCircle2 size={13} aria-hidden />} Ready</span>}
                      </td>
                      {def.columns.map((c) => {
                        const cell = r.cells[c.key];
                        return (
                          <td key={c.key} title={cell?.error || cell?.warning} className={clsx('min-w-[130px] max-w-[220px] px-3 py-2', cell?.error && 'bg-danger-light/60', cell?.warning && 'bg-amber-50')}>
                            <span className="block truncate">{str(r.row[c.key]) || <span className="text-slate-300">-</span>}</span>
                            {cell && <span className={clsx('mt-0.5 block whitespace-normal text-[11px] font-medium', cell.error ? 'text-danger-dark' : 'text-amber-700')}>{cell.error || cell.warning}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={reset} disabled={running}><RotateCcw size={14} aria-hidden /> Upload another file</button>
              {(errorRows > 0 || failed > 0) && <button type="button" className="btn-outline btn-sm" onClick={downloadReport} disabled={running}><Download size={14} aria-hidden /> Error report</button>}
            </div>
            {running
              ? <button type="button" className="btn-outline" onClick={() => { stopRef.current = true; }}><Square size={14} aria-hidden /> Stop</button>
              : (
                <button type="button" className="btn-primary" disabled={!valid.length || imported === valid.length} onClick={runImport}>
                  {running ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
                  {imported > 0 && imported < valid.length ? `Import remaining ${valid.length - imported}` : `Import ${valid.length} row${valid.length === 1 ? '' : 's'}`}
                </button>
              )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page
export function BulkImport() {
  const user = useAuth((s) => s.user);
  const { merchants, branches, rateCard, createShipment, changeStatus, setValue } = useData();
  const shipments = useScopedShipments();
  const [params, setParams] = useSearchParams();
  const tabs = Object.entries(KINDS).filter(([, k]) => k.roles.includes(user.role)).map(([value, k]) => ({ value, label: k.label }));
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : tabs[0]?.value;
  const isMerchant = user.role === 'merchant';
  const [customerId, setCustomerId] = useState(isMerchant ? user.merchantId : '');

  const bookable = useMemo(() => merchants.filter((m) => m.status === 'Active'), [merchants]);
  const customer = merchants.find((m) => m.id === (isMerchant ? user.merchantId : customerId));
  const pickup = customer?.pickups?.[0];

  const ctx = useMemo(() => ({
    customer,
    sender: customer && pickup ? { name: customer.name, phone: pickup.phone || customer.phone, address: pickup.address, city: pickup.city } : null,
    terms: (customer?.paymentTypes || []).filter(Boolean),
    plan: customer?.shippingPlans?.[0] || '',
    byAwb: Object.fromEntries(shipments.map((s) => [s.awb.toUpperCase(), s])),
    names: new Set(merchants.map((m) => m.name.toLowerCase())),
    fixedBranch: user.role === 'branch_manager' ? user.branchId : null,
    branchFor: (v) => branches.find((b) => [b.id, b.code, b.name].some((x) => String(x || '').toLowerCase() === str(v).toLowerCase())),
    rateCard, createShipment, changeStatus, setValue,
  }), [customer, pickup, shipments, merchants, branches, rateCard, createShipment, changeStatus, setValue, user]);

  if (!tabs.length) return null;
  const def = KINDS[tab];
  let disabledReason = null;
  if (def.needsCustomer) {
    if (!customer) disabledReason = isMerchant ? 'This login is not linked to a customer account yet.' : 'Choose the customer account to book for.';
    else if (!pickup) disabledReason = `${customer.name} has no pickup address. Add one on the customer account first.`;
    else if (customer.status !== 'Active') disabledReason = `${customer.name} is not active.`;
  }

  return (
    <div>
      <PageHeader
        title="Bulk Import"
        subtitle="Upload a spreadsheet to create or update many records at once."
        actions={tab === 'booking' && <Link to="/shipments/new" className="btn-outline">Single booking</Link>}
      />
      <Tabs tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      <p className="mb-4 text-sm text-ink-muted">{def.intro}</p>
      {def.needsCustomer && !isMerchant && (
        <div className="mb-4 max-w-md">
          <label htmlFor="bulk-customer" className="label">Customer account<span className="text-danger"> *</span></label>
          <select id="bulk-customer" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select...</option>
            {bookable.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.city})</option>)}
          </select>
          {customer && <p className="mt-1 text-xs text-ink-muted">Payment types on this account: {ctx.terms.length ? ctx.terms.map(paymentTermLabel).join(', ') : 'any'}</p>}
        </div>
      )}
      {/* Keyed so switching tab or customer starts a fresh file. */}
      <ImportWizard key={`${tab}-${customer?.id || ''}`} kind={tab} ctx={ctx} disabledReason={disabledReason} />
    </div>
  );
}
