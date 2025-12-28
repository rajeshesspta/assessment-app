import { FormEvent, useMemo, useState } from 'react';
import type { TenantSession } from '../hooks/useTenantSession';

interface TenantSessionFormProps {
  value: TenantSession | null;
  onSave: (session: TenantSession) => void;
  onClear: () => void;
  user?: { roles?: string[] };
}

const ROLE_PRESETS = ['LEARNER', 'CONTENT_AUTHOR', 'TENANT_ADMIN'];

export function TenantSessionForm({ value, onSave, onClear, user }: TenantSessionFormProps) {
  const [formState, setFormState] = useState<TenantSession>(() => value ?? {
    apiBaseUrl: '/api',
    actorRoles: user?.roles || ['LEARNER'],
    userId: '',
    tenantId: '',
  });

  const canSubmit = useMemo(() => (
    formState.apiBaseUrl.length > 0
    && formState.userId.length > 0
    && formState.tenantId.length > 0
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
      className="rounded-3xl border border-brand-50 bg-white p-6 text-slate-900"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tenant session</h2>
          <p className="text-sm text-slate-600">Point the portal at your BFF endpoint and identify the learner who is launching attempts.</p>
        </div>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
          >
            Clear session
          </button>
        )}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          BFF API Base URL
          <input
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-brand-500"
            type="text"
            placeholder="http://localhost:4000"
            value={formState.apiBaseUrl}
            onChange={event => handleInputChange('apiBaseUrl', event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tenant Id
          <input
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-brand-500"
            type="text"
            placeholder="tenant-123"
            value={formState.tenantId}
            onChange={event => handleInputChange('tenantId', event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Learner Id
          <input
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-brand-500"
            type="text"
            placeholder="learner-123"
            value={formState.userId}
            onChange={event => handleInputChange('userId', event.target.value)}
          />
        </label>
      </div>
      <div className="mt-6">
        <span className="text-sm font-semibold text-slate-700">Actor roles</span>
        <div className="mt-3 flex flex-wrap gap-3">
          {ROLE_PRESETS.map(role => {
            const isActive = formState.actorRoles.includes(role);
            return (
              <button
                type="button"
                key={role}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'border border-slate-200 text-slate-500 hover:border-brand-200 hover:text-brand-600'
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
          className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save session
        </button>
      </div>
    </form>
  );
}
