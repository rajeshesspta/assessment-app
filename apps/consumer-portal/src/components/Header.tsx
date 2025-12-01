interface HeaderProps {
  environmentLabel?: string;
}

export function Header({ environmentLabel = 'Consumer Tenant Portal' }: HeaderProps) {
  return (
    <header className="rounded-2xl bg-white/80 p-6 ring-1 ring-slate-100 backdrop-blur">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
            {environmentLabel}
          </span>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Tenant Learner Experience</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Drive the headless assessment APIs from a tenant-facing experience. Configure tenant credentials and launch attempts end-to-end.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">App version</p>
          <p className="text-2xl font-bold text-slate-900">{__APP_VERSION__}</p>
        </div>
      </div>
    </header>
  );
}
