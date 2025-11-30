interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading' }: LoadingStateProps) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
