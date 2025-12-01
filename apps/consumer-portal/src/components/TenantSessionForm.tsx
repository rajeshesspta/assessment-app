import { FormEvent, useMemo, useState } from 'react';
import type { TenantSession } from '../hooks/useTenantSession';

interface TenantSessionFormProps {
  value: TenantSession | null;
  onSave: (session: TenantSession) => void;
  onClear: () => void;
}

const ROLE_PRESETS = ['LEARNER', 'CONTENT_AUTHOR', 'TENANT_ADMIN'];

export function TenantSessionForm({ value, onSave, onClear }: TenantSessionFormProps) {
  const [formState, setFormState] = useState<TenantSession>(() => value ?? {
    apiBaseUrl: '/api',
    actorRoles: ['LEARNER'],
    userId: '',
  });

  const canSubmit = useMemo(() => (
    formState.apiBaseUrl.length > 0
    && formState.userId.length > 0
  ), [formState]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSave({
      ...formState,
      actorRoles: formState.actorRoles.filter(Boolean),
    });
  }

  function handleInputChange<K extends keyof TenantSession>(key: K, value: TenantSession[K]) {
    setFormState(prev => ({ ...prev, [key]: value }));
  }

  function handleRoleToggle(role: string) {
    setFormState(prev => {
      const hasRole = prev.actorRoles.includes(role);
      const actorRoles = hasRole ? prev.actorRoles.filter(item => item !== role) : [...prev.actorRoles, role];
      return { ...prev, actorRoles };
    });
  }

  return (
    <form
      className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-100 shadow-glow backdrop-blur"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Tenant session</h2>
          <p className="text-sm text-slate-300">Point the portal at your BFF endpoint and identify the learner who is launching attempts.</p>
        </div>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/40 hover:text-white"
          >
            Clear session
          </button>
        )}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-200">
          BFF API Base URL
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 text-slate-100 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:ring-brand-500"
            type="text"
            placeholder="http://127.0.0.1:4000"
            value={formState.apiBaseUrl}
            onChange={event => handleInputChange('apiBaseUrl', event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-slate-200">
          Learner Id
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 text-slate-100 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:ring-brand-500"
            type="text"
            placeholder="learner-123"
            value={formState.userId}
            onChange={event => handleInputChange('userId', event.target.value)}
          />
        </label>
      </div>
      <div className="mt-6">
        <span className="text-sm font-semibold text-slate-200">Actor roles</span>
        <div className="mt-3 flex flex-wrap gap-3">
          {ROLE_PRESETS.map(role => {
            const isActive = formState.actorRoles.includes(role);
            return (
              <button
                type="button"
                key={role}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/40 hover:bg-brand-700'
                    : 'border border-white/20 text-slate-300 hover:border-white/40 hover:text-white'
                }`}
                onClick={() => handleRoleToggle(role)}
              >
                {role}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/40 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save session
        </button>
      </div>
    </form>
  );
}
