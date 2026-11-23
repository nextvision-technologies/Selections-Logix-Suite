// Welcome door shown once after signing in. Two panels stay closed while the first database load
// runs, then the greeting fades, a line of light runs down the seam and the panels slide apart onto
// the dashboard. Click, Esc, Enter or Skip opens them at once; reduced-motion users never see it.
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '../../store/authStore.js';
import { useData } from '../../store/dataStore.js';
import { useWelcome } from '../../store/uiStore.js';
import { ROLE_LABELS } from '../../data/config.js';

const MIN_CLOSED_MS = 1400; // long enough to read the greeting
const MAX_CLOSED_MS = 7000; // a slow network never keeps the doors shut for good
const CONTENT_OUT_MS = 320;
const SEAM_MS = 260;
const SLIDE_MS = 1050;
const EASE = 'cubic-bezier(.76,0,.24,1)';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function Panel({ side, phase }) {
  const left = side === 'left';
  const moving = phase === 'open';
  return (
    <div
      className="absolute inset-y-0 w-1/2 overflow-hidden"
      style={{
        [left ? 'left' : 'right']: 0,
        transform: moving ? `translate3d(${left ? '-101%' : '101%'},0,0)` : 'translate3d(0,0,0)',
        transition: `transform ${SLIDE_MS}ms ${EASE}`,
        willChange: 'transform',
        background: left
          ? 'linear-gradient(100deg, #070D1F 0%, #0B1530 55%, #12204A 100%)'
          : 'linear-gradient(260deg, #070D1F 0%, #0B1530 55%, #12204A 100%)',
        boxShadow: moving ? `${left ? '' : '-'}24px 0 60px rgba(0,0,0,.45)` : 'none',
      }}
    >
      {/* Faint grid and a soft light near the seam give depth without clutter. */}
      <div aria-hidden className="absolute inset-0 opacity-[.35] [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div aria-hidden className={clsx('absolute inset-y-0 w-1/2', left ? 'right-0' : 'left-0')} style={{ background: `radial-gradient(60% 50% at ${left ? '100%' : '0%'} 50%, rgba(250,204,21,.08), transparent 70%)` }} />
      {/* Inner edge: a thin gold line along the seam, faded out behind the greeting in the middle. */}
      <div aria-hidden className={clsx('absolute inset-y-0 w-px', left ? 'right-0' : 'left-0')} style={{ background: 'linear-gradient(to bottom, transparent 4%, rgba(250,204,21,.45) 16%, transparent 30%, transparent 70%, rgba(250,204,21,.45) 84%, transparent 96%)' }} />
      {/* Slim handle, shown once the greeting has gone so it never crosses the text. */}
      <div
        aria-hidden
        className={clsx('absolute top-1/2 h-16 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-200/80 via-primary/80 to-amber-600/80', left ? 'right-5' : 'left-5')}
        style={{ opacity: phase === 'closed' ? 0 : 1, transition: 'opacity 250ms ease' }}
      />
    </div>
  );
}

export default function WelcomeDoor() {
  const show = useWelcome((s) => s.show);
  const user = useAuth((s) => s.user);
  const synced = useData((s) => s.synced);
  // closed -> leaving (greeting fades, seam lights up) -> open (panels slide) -> removed
  const [phase, setPhase] = useState('closed');
  const [minDone, setMinDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const started = useRef(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const close = () => useWelcome.setState({ show: false });
  const begin = () => {
    if (started.current) return;
    started.current = true;
    setPhase('leaving');
  };

  // Reset for each sign-in and start the minimum / maximum timers.
  useEffect(() => {
    if (!show) return undefined;
    if (reduced) { close(); return undefined; }
    started.current = false;
    setPhase('closed'); setMinDone(false); setTimedOut(false);
    const a = setTimeout(() => setMinDone(true), MIN_CLOSED_MS);
    const b = setTimeout(() => setTimedOut(true), MAX_CLOSED_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line
  }, [show]);

  // Open once the data is in and the greeting had time to be read, or when the wait runs out.
  useEffect(() => {
    if (show && ((synced && minDone) || timedOut)) begin();
  }, [show, synced, minDone, timedOut]);

  // Step through the opening and remove the overlay at the end.
  useEffect(() => {
    if (phase === 'leaving') {
      const t = setTimeout(() => setPhase('open'), CONTENT_OUT_MS + SEAM_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'open') {
      const t = setTimeout(close, SLIDE_MS + 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); begin(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  if (!show || !user || reduced) return null;
  const first = user.name?.split(' ')[0] || 'there';
  const contentOut = phase !== 'closed';

  return (
    <div className="fixed inset-0 z-[90] cursor-pointer select-none overflow-hidden" onClick={begin} role="dialog" aria-modal="true" aria-label={`Welcome, ${first}`}>
      <Panel side="left" phase={phase} />
      <Panel side="right" phase={phase} />

      {/* Light running down the seam just before the panels part. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2"
        style={{
          background: 'linear-gradient(to bottom, transparent, #FDE68A 20%, #FACC15 50%, #FDE68A 80%, transparent)',
          boxShadow: '0 0 24px 6px rgba(250,204,21,.45)',
          transform: `translateX(-50%) scaleY(${phase === 'closed' ? 0 : 1})`,
          opacity: phase === 'leaving' ? 1 : 0,
          transition: `transform ${SEAM_MS}ms ${EASE} ${CONTENT_OUT_MS}ms, opacity 200ms ease`,
        }}
      />

      {/* Greeting. Each line rises in on arrival and fades out together before the doors move. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        style={{ opacity: contentOut ? 0 : 1, transform: contentOut ? 'translateY(-8px)' : 'none', transition: `opacity ${CONTENT_OUT_MS}ms ease, transform ${CONTENT_OUT_MS}ms ease` }}
      >
        <div className="door-in" style={{ animationDelay: '80ms' }}>
          <div className="mx-auto mb-7 flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-white/[.06] ring-1 ring-white/15 shadow-[0_0_80px_rgba(250,204,21,.22)] backdrop-blur-sm">
            <svg viewBox="0 0 32 32" className="h-11 w-11" aria-hidden>
              <rect width="32" height="32" rx="9" fill="#DC2626" />
              <path d="M8 11l8-4 8 4v10l-8 4-8-4z" fill="#FACC15" />
              <path d="M8 11l8 4 8-4M16 15v10" stroke="#111827" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>
        <p className="door-in text-[11px] font-semibold uppercase tracking-[.28em] text-primary/90" style={{ animationDelay: '220ms' }}>
          {ROLE_LABELS[user.role]}
        </p>
        <h1 className="door-in mt-3 text-[30px] font-bold leading-tight tracking-tight text-white sm:text-[46px]" style={{ animationDelay: '320ms' }}>
          {greeting()}, {first}
        </h1>
        <p className="door-in mt-2 text-sm text-slate-400 sm:text-[15px]" style={{ animationDelay: '420ms' }}>Selections Logix Suite</p>

        {/* Thin progress line: moves while loading, fills once the dashboard is ready. */}
        <div className="door-in mt-10 w-44" style={{ animationDelay: '520ms' }}>
          <div className="h-[2px] overflow-hidden rounded-full bg-white/10">
            {synced
              ? <div className="h-full w-full rounded-full bg-primary transition-all duration-500" />
              : <div className="h-full w-1/3 rounded-full bg-primary [animation:busy-slide_1.2s_ease-in-out_infinite]" />}
          </div>
          <p className="mt-3 text-[11px] font-medium tracking-wide text-slate-500">{synced ? 'Ready' : 'Preparing your dashboard'}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); begin(); }}
        className="absolute bottom-6 right-6 rounded-full px-4 py-2 text-xs font-medium text-slate-400 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-white"
        style={{ opacity: contentOut ? 0 : 1, transition: 'opacity 250ms ease' }}
      >
        Skip
      </button>
    </div>
  );
}
