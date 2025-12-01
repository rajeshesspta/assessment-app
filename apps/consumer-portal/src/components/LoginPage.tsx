import { useState } from 'react';
import type { PortalAuthProvider } from '../hooks/usePortalAuth';

interface LoginPageProps {
  onProviderLogin(provider: PortalAuthProvider, roles: string[], profile?: { name?: string; email?: string }): void;
  onCustomLogin(details: { name: string; email: string; roles: string[] }): void;
}

const ROLE_OPTIONS = ['LEARNER', 'CONTENT_AUTHOR', 'TENANT_ADMIN'];

type SsoProvider = 'google' | 'microsoft' | 'enterprise';

const GoogleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
    <path fill="#EA4335" d="M12 10.2v3.84h5.45c-.22 1.32-1.64 3.88-5.45 3.88-3.28 0-5.96-2.7-5.96-6.02S8.72 5.88 12 5.88c1.86 0 3.12.8 3.84 1.48l2.62-2.54C16.65 3.12 14.56 2.25 12 2.25 6.9 2.25 2.7 6.48 2.7 11.5S6.9 20.75 12 20.75c6.1 0 9.05-4.29 9.05-8.63 0-.58-.06-1.02-.14-1.47H12z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
    <rect width="9.5" height="9.5" x="2.5" y="2.5" fill="#F25022" />
    <rect width="9.5" height="9.5" x="12" y="2.5" fill="#7FBA00" />
    <rect width="9.5" height="9.5" x="2.5" y="12" fill="#00A4EF" />
    <rect width="9.5" height="9.5" x="12" y="12" fill="#FFB900" />
  </svg>
);

const EnterpriseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-brand-600">
    <path
      fill="currentColor"
      d="M4 20h16v-2h-1V7l-5-3-5 3v11H9v-5H7v5H5v-3H4v4zm9-2h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V8h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V8h2v2z"
    />
  </svg>
);

export function LoginPage({ onProviderLogin, onCustomLogin }: LoginPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['LEARNER']);
  const [enterpriseIdentity, setEnterpriseIdentity] = useState('');

  function toggleRole(role: string) {
    setSelectedRoles(prev => {
      if (prev.includes(role)) {
        const next = prev.filter(item => item !== role);
        return next.length > 0 ? next : ['LEARNER'];
      }
      return [...prev, role];
    });
  }

  function deriveNameFromEmail(address: string) {
    const localPart = address.split('@')[0] ?? '';
    if (!localPart) {
      return undefined;
    }
    return localPart
      .split(/[._-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function handleProviderLogin(provider: SsoProvider) {
    if (provider === 'enterprise') {
      const normalizedEmail = enterpriseIdentity.trim();
      const profile = normalizedEmail
        ? {
            email: normalizedEmail,
            name: deriveNameFromEmail(normalizedEmail),
          }
        : undefined;
      onProviderLogin(provider, selectedRoles, profile);
      return;
    }

    onProviderLogin(provider, selectedRoles);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sunrise-50 via-white to-sunrise-100 px-4 py-12 text-slate-900">
      <div className="w-full max-w-4xl rounded-3xl border-2 border-brand-100 bg-white/95 p-8 backdrop-blur">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-500">Assessment Portal</p>
          <h1 className="text-3xl font-bold text-slate-900">Sign in to continue</h1>
          <p className="text-sm text-slate-600">Use a federated login or enter your learner credentials to access cohort assignments.</p>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-brand-50 bg-white p-6">
            <p className="text-sm font-semibold text-slate-700">Single sign-on</p>
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-600"
                onClick={() => handleProviderLogin('google')}
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-600"
                onClick={() => handleProviderLogin('microsoft')}
              >
                <MicrosoftIcon />
                Continue with Microsoft
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-600"
                onClick={() => handleProviderLogin('enterprise')}
              >
                <EnterpriseIcon />
                Continue with Enterprise SSO
              </button>
              <label className="text-xs font-medium text-slate-500">
                Enterprise identity (optional)
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  type="email"
                  inputMode="email"
                  placeholder="you@enterprise.com"
                  value={enterpriseIdentity}
                  onChange={event => setEnterpriseIdentity(event.target.value)}
                />
              </label>
            </div>
          </div>
          <form
            className="space-y-4 rounded-2xl border border-brand-50 bg-white p-6"
            onSubmit={event => {
              event.preventDefault();
              if (!name.trim() || !email.trim()) {
                return;
              }
              onCustomLogin({ name: name.trim(), email: email.trim(), roles: selectedRoles });
            }}
          >
            <p className="text-sm font-semibold text-slate-700">Tenant credentials</p>
            <label className="text-sm font-medium text-slate-700">
              Full name
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ada Learner"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Work email
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="ada@example.com"
              />
            </label>
            <div>
              <p className="text-sm font-semibold text-slate-700">Role selection</p>
              <p className="text-xs text-slate-500">Choose at least one role to preview available surfaces.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {ROLE_OPTIONS.map(role => {
                  const isActive = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-brand-500 text-white'
                          : 'border border-slate-200 text-slate-500 hover:border-brand-200 hover:text-brand-600'
                      }`}
                      onClick={() => toggleRole(role)}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Sign in
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">By continuing you agree to the Acceptable Use Policy and privacy terms.</p>
      </div>
    </div>
  );
}