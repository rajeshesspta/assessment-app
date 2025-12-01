import { useState } from 'react';
import type { PortalAuthProvider } from '../hooks/usePortalAuth';

interface LoginPageProps {
  onProviderLogin(provider: PortalAuthProvider): void;
  onCustomLogin(details: { name: string; email: string }): void;
}

export function LoginPage({ onProviderLogin, onCustomLogin }: LoginPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-midnight-700 via-midnight-900 to-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-4xl rounded-3xl bg-white/10 p-8 shadow-glow backdrop-blur-xl ring-1 ring-white/5">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-200">Assessment Portal</p>
          <h1 className="text-3xl font-bold text-white">Sign in to continue</h1>
          <p className="text-sm text-slate-200">Use a federated login or enter your learner credentials to access cohort assignments.</p>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm font-semibold text-slate-200">Single sign-on</p>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={() => onProviderLogin('google')}
            >
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Continue with Google
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={() => onProviderLogin('microsoft')}
            >
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Continue with Microsoft
            </button>
          </div>
          <form
            className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6"
            onSubmit={event => {
              event.preventDefault();
              if (!name.trim() || !email.trim()) {
                return;
              }
              onCustomLogin({ name: name.trim(), email: email.trim() });
            }}
          >
            <p className="text-sm font-semibold text-slate-200">Tenant credentials</p>
            <label className="text-sm font-medium text-slate-200">
              Full name
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ada Learner"
              />
            </label>
            <label className="text-sm font-medium text-slate-200">
              Work email
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="ada@example.com"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Sign in
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">By continuing you agree to the Acceptable Use Policy and privacy terms.</p>
      </div>
    </div>
  );
}