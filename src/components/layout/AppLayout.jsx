import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserCircle2, X } from 'lucide-react';
import { useAuth } from '../../store/authStore.js';
import { useDbSync } from '../../hooks/useDbSync.js';
import { useUI } from '../../store/uiStore.js';
import { useData } from '../../store/dataStore.js';
import { useActiveBranch, useCan } from '../../hooks/useApp.js';
import { navFor, labelForPath } from '../../routes/index.jsx';
import { ROLE_LABELS } from '../../data/config.js';
import { CURRENCIES, fmtTimeAgo } from '../../utils/format.js';
import { ErrorBoundary } from './Fallbacks.jsx';
import WelcomeDoor from './WelcomeDoor.jsx';
import { PageSkeleton } from '../ui/index.jsx';

export function Logo({ compact, className, dark }) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0 drop-shadow-sm" aria-hidden>
        <defs>
          <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#EF4444" /><stop offset="1" stopColor="#B91C1C" /></linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-bg)" />
        <path d="M8 11l8-4 8 4v10l-8 4-8-4z" fill="#FACC15" />
        <path d="M8 11l8 4 8-4M16 15v10" stroke="#111827" strokeWidth="1.5" fill="none" />
      </svg>
      {!compact && (
        <span className={clsx('font-brand text-[15px] font-extrabold leading-tight', dark ? 'text-white' : 'text-ink')}>
          Selections<br /><span className={clsx('text-xs font-semibold', dark ? 'text-slate-400' : 'text-ink-muted')}>Logix Suite</span>
        </span>
      )}
    </span>
  );
}

function Sidebar({ open, onClose }) {
  const can = useCan();
  const role = useAuth((s) => s.user?.role);
  const collapsedPref = useUI((s) => s.collapsed);
  const toggle = useUI((s) => s.toggleCollapsed);
  const nav = useMemo(() => navFor(role, can), [role, can]);
  // The mobile drawer always shows labels, whatever the desktop preference is.
  const collapsed = collapsedPref && !open;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 animate-fade-in bg-[#070D1F]/50 backdrop-blur-[2px] lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={clsx(
          'fixed inset-y-0 start-0 z-40 flex shrink-0 flex-col bg-gradient-to-b from-[#0B1530] via-[#0B1530] to-[#070D1F] text-slate-300 shadow-2xl transition-all duration-300 lg:sticky lg:top-0 lg:h-screen lg:shadow-none',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
          'w-72',
          // Off-canvas only below lg; on desktop the sidebar is always in the page flow.
          !open && 'max-lg:-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className={clsx('flex h-16 items-center justify-between px-4', collapsed && 'lg:justify-center lg:px-2')}>
          <Link to="/" onClick={onClose}><Logo compact={collapsed} dark /></Link>
          <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="scroll-thin scroll-dark flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
          {nav.map(({ group, items }) => (
            <div key={group}>
              {!collapsed && <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[.12em] text-slate-500">{group}</p>}
              {collapsed && <span className="mx-auto mb-2 block h-px w-6 bg-white/10" aria-hidden />}
              <ul className="space-y-0.5">
                {items.map(({ path, nav: item }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      end
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) => clsx(
                        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-150',
                        collapsed && 'justify-center',
                        isActive ? 'bg-primary font-semibold text-ink shadow-glow' : 'text-slate-300 hover:bg-white/[.06] hover:text-white',
                      )}
                    >
                      <item.icon size={18} className="shrink-0 transition-transform group-hover:scale-110" aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {collapsed && <span className="sr-only">{item.label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <button type="button" onClick={toggle} className={clsx('mx-3 mb-3 hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-slate-400 transition hover:bg-white/[.06] hover:text-white lg:flex', collapsed && 'justify-center')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
        </button>
      </aside>
    </>
  );
}

function useOutside(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onOutside(); };
    const onKey = (e) => { if (e.key === 'Escape') onOutside(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line
  }, []);
  return ref;
}

/** Ctrl/Cmd+K search across shipments and, depending on role, customers, riders, tickets. */
function GlobalSearch() {
  const can = useCan();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { shipments, merchants, riders } = useData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const ref = useOutside(() => setOpen(false));

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const has = (...v) => v.some((x) => String(x || '').toLowerCase().includes(term));
    const visible = user.role === 'merchant' ? shipments.filter((s) => s.merchantId === user.merchantId)
      : user.role === 'rider' ? shipments.filter((s) => s.riderId === user.riderId) : shipments;
    const out = visible.filter((s) => has(s.awb, s.receiver.name, s.receiver.phone, s.destCity)).slice(0, 5)
      .map((s) => ({ key: s.id, type: 'Shipment', label: s.awb, sub: `${s.receiver.name} - ${s.destCity}`, to: user.role === 'rider' ? '/rider-app' : `/shipments/${s.id}` }));
    if (can('customers')) merchants.filter((m) => has(m.name, m.contact, m.phone)).slice(0, 3).forEach((m) => out.push({ key: m.id, type: 'Customer', label: m.name, sub: m.city, to: `/customers/${m.id}` }));
    if (can('riders')) riders.filter((r) => has(r.name, r.phone)).slice(0, 3).forEach((r) => out.push({ key: r.id, type: 'Rider', label: r.name, sub: r.zone, to: `/riders/${r.id}` }));
    return out;
  }, [q, shipments, merchants, riders, user, can]);

  const go = (r) => { navigate(r.to); setQ(''); setOpen(false); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) go(results[cursor]);
  };

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md" ref={ref}>
      <Search size={16} className="absolute start-3.5 top-3 text-slate-400" aria-hidden />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search AWB, customer, rider..."
        aria-label="Global search"
        className="input !rounded-full !border-transparent !bg-slate-100/80 !ps-10 !shadow-none hover:!bg-slate-100 focus:!border-gray-300 focus:!bg-white"
      />
      <kbd className="pointer-events-none absolute end-3 top-2.5 hidden rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted md:block">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 max-h-96 w-full min-w-[280px] animate-scale-in overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-pop">
          {!results.length && <p className="px-3 py-4 text-center text-sm text-ink-muted">No results</p>}
          {results.map((r, i) => (
            <button key={`${r.type}-${r.key}`} type="button" onMouseEnter={() => setCursor(i)} onClick={() => go(r)} className={clsx('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start', i === cursor && 'bg-primary-light')}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.label}</span>
                <span className="block truncate text-xs text-ink-muted">{r.sub}</span>
              </span>
              <span className="chip shrink-0">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const navigate = useNavigate();
  const notifications = useData((s) => s.notifications);
  const updateItem = useData((s) => s.updateItem);
  const setValue = useData((s) => s.setValue);
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const can = useCan();
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-ink" onClick={() => setOpen((o) => !o)} aria-label={`Notifications: ${unread}`} aria-expanded={open}>
        <Bell size={19} aria-hidden />
        {unread > 0 && <span className="absolute end-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-30 animate-scale-in overflow-hidden rounded-2xl border border-line bg-white shadow-pop sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setValue('notifications', notifications.map((n) => ({ ...n, read: true })), 'Notification', 'Marked all read')}>Mark all read</button>
          </div>
          <div className="scroll-thin max-h-80 overflow-y-auto">
            {notifications.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  updateItem('notifications', n.id, { read: true }, 'Notification');
                  setOpen(false);
                  // Roles without access to the target stay on the notification centre instead of a 403.
                  const module = n.link?.split('/')[1];
                  const map = { shipments: 'shipments', finance: 'finance', warehouse: 'warehouse', support: 'support' };
                  navigate(can(map[module]) ? n.link : '/notifications');
                }}
                className={clsx('block w-full border-b border-line px-3 py-2 text-start last:border-0 hover:bg-surface', !n.read && 'bg-primary-light/40')}
              >
                <p className={clsx('text-sm font-medium', n.type === 'alert' && 'text-danger-dark')}>{n.title}</p>
                <p className="truncate text-xs text-ink-muted">{n.body} - {fmtTimeAgo(n.at)}</p>
              </button>
            ))}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-3 py-2 text-center text-xs font-medium hover:bg-surface">View all</Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { currency, setCurrency, setBranch: pickBranch } = useUI();
  const branches = useData((s) => s.branches);
  const activeBranch = useActiveBranch();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="flex items-center gap-2.5 rounded-full p-1 pe-1 transition hover:bg-slate-100 xl:pe-3" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Profile">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-amber-500 text-xs font-bold text-ink shadow-sm ring-2 ring-white">{user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
        <span className="hidden text-start xl:block">
          <span className="block text-xs font-semibold leading-tight">{user.name}</span>
          <span className="block text-[11px] leading-tight text-ink-muted">{ROLE_LABELS[user.role]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute end-0 z-30 mt-2 w-64 animate-scale-in rounded-2xl border border-line bg-white p-1.5 shadow-pop">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <UserCircle2 size={18} className="text-ink-muted" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
          </div>
          {/* The top bar has no room for these on phones. */}
          <div className="grid gap-1.5 border-t border-line px-2.5 py-2 md:hidden">
            <select aria-label="Currency (mobile)" className="input !py-1.5 !text-xs" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            {!['merchant', 'rider'].includes(user.role) && (
              <select aria-label="Branch (mobile)" className="input !py-1.5 !text-xs" value={activeBranch} disabled={user.role === 'branch_manager'} onChange={(e) => pickBranch(e.target.value)}>
                <option value="ALL">All Branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
          <p className="border-t border-line px-2.5 pt-2 text-[11px] text-ink-muted">Signed in as {ROLE_LABELS[user.role]}</p>
          <button type="button" onClick={async () => { await logout(); navigate('/login'); }} className="mt-1 flex w-full items-center gap-2 border-t border-line px-2.5 pb-1 pt-2 text-start text-sm text-danger hover:text-danger-hover">
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }) {
  const user = useAuth((s) => s.user);
  const branches = useData((s) => s.branches);
  const { currency, setCurrency, setBranch } = useUI();
  const activeBranch = useActiveBranch();
  const showBranch = !['merchant', 'rider'].includes(user.role);
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line/70 bg-white/75 px-3 backdrop-blur-xl sm:gap-3 sm:px-6 print:hidden">
      <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
      <GlobalSearch />
      <div className="ms-auto flex items-center gap-1.5">
        {showBranch && (
          <select
            aria-label="Branch"
            className="input hidden !w-auto max-w-[150px] !py-1.5 !text-xs md:block"
            value={activeBranch}
            disabled={user.role === 'branch_manager'}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select aria-label="Currency" className="input hidden !w-auto !py-1.5 !text-xs sm:block" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  const crumbs = parts.map((part, i) => {
    const path = `/${parts.slice(0, i + 1).join('/')}`;
    return { path, label: labelForPath(path) || (/\d/.test(part) || part === part.toUpperCase() ? part : part.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())), hasRoute: !!labelForPath(path) };
  });
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs font-medium text-ink-muted print:hidden">
      <Link to="/" className="hover:text-ink">Home</Link>
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          <ChevronRight size={12} aria-hidden />
          {i === crumbs.length - 1 || !c.hasRoute ? <span className={i === crumbs.length - 1 ? 'text-ink' : ''}>{c.label}</span> : <Link to={c.path} className="hover:text-ink">{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  useDbSync();
  const synced = useData((s) => s.synced);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="flex min-h-screen">
      <WelcomeDoor />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <Breadcrumbs />
          {/* Keyed by path so a crashed screen recovers when the user navigates away. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageSkeleton />}>
              {/* Screens wait for the first database load instead of flashing empty lists and zeros. */}
              {synced ? <Outlet /> : <PageSkeleton label="Loading your data..." />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
