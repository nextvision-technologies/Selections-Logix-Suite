import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, PackageSearch } from 'lucide-react';
import { useAuth } from '../../store/authStore.js';
import { useUI, useWelcome } from '../../store/uiStore.js';
import { Logo } from '../../components/layout/AppLayout.jsx';
import { FieldError } from '../../components/forms/EntityForm.jsx';
import { getRemember, setRemember } from '../../lib/appwrite.js';

const EMAIL_KEY = 'slx-last-email';
const readEmail = () => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } };
const writeEmail = (v) => { try { if (v) localStorage.setItem(EMAIL_KEY, v); else localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ } };

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, ready, login, error: authError } = useAuth();
  const { setBranch } = useUI();
  const [failed, setFailed] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: getRemember() ? readEmail() : '', password: '', remember: getRemember() },
  });

  if (ready && user) return <Navigate to={location.state?.from || '/'} replace />;

  const onSubmit = async ({ email, password, remember }) => {
    setFailed('');
    setRemember(remember); // decides where the session is stored, so set it before signing in
    writeEmail(remember ? email.trim() : '');
    const res = await login(email, password);
    if (res.error) { setFailed(res.error); return; }
    setBranch('ALL');
    useWelcome.setState({ show: true }); // the welcome door greets them instead of a toast
    navigate(location.state?.from || '/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#12204A] via-[#0B1530] to-[#070D1F] p-6 text-white lg:w-[46%] lg:p-12">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="absolute -end-24 -top-24 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-28 -start-20 h-80 w-80 rounded-full bg-primary/25 blur-3xl" aria-hidden />
        <div className="relative animate-fade-up"><Logo dark /></div>
        <div className="relative mt-10 animate-fade-up lg:mt-0">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-white/15">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden /> Logistics, end to end
          </p>
          <h1 className="text-4xl leading-[1.1] text-white lg:text-6xl">Ship. Collect.<br /><span className="bg-gradient-to-r from-primary to-amber-300 bg-clip-text text-transparent">Control.</span></h1>
          <p className="mt-4 max-w-md text-sm text-slate-300 lg:text-base">Courier, COD, cargo, warehouse, customs, returns, finance and support in one system.</p>
          <ul className="mt-8 hidden gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
            {[['Live tracking', 'Every parcel, every scan'], ['COD control', 'Rider to payout'], ['Role based', 'Six team roles']].map(([t, d]) => (
              <li key={t} className="rounded-2xl bg-white/[.06] p-4 ring-1 ring-white/10 backdrop-blur">
                <p className="font-brand text-sm font-bold text-white">{t}</p>
                <p className="mt-0.5 text-xs text-slate-400">{d}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-6 hidden text-xs font-medium text-slate-400 lg:block">© Selections Technologies</p>
      </section>

      <section className="flex flex-1 items-center justify-center bg-white p-6 sm:p-10">
        <div className="w-full max-w-md animate-fade-up">
          <h2 className="text-2xl sm:text-3xl">Welcome back</h2>
          <p className="mb-7 mt-1 text-sm text-ink-muted">Sign in to your account to continue.</p>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" autoComplete="username" placeholder="you@company.com" className={`input ${errors.email ? 'input-error' : ''}`} {...register('email')} />
              <FieldError message={errors.email?.message} />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" className={`input pe-10 ${errors.password ? 'input-error' : ''}`} {...register('password')} />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-lg text-ink-muted hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                </button>
              </div>
              <FieldError message={errors.password?.message} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary-hover" {...register('remember')} />
              Remember me
            </label>
            {(failed || (!user && authError)) && <p role="alert" className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger-dark">{failed || authError}</p>}
            <button type="submit" className="btn-primary h-11 w-full text-[15px]" disabled={isSubmitting}>
              {isSubmitting && <Loader2 size={16} className="animate-spin" aria-hidden />} Sign in
            </button>
          </form>
          <p className="mt-4 text-xs text-ink-muted">Accounts are created by the Super Admin. Forgot your password? Ask your administrator to reset it.</p>

          <Link to="/track" className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
            <PackageSearch size={16} aria-hidden /> Track a parcel
          </Link>
        </div>
      </section>
    </div>
  );
}
