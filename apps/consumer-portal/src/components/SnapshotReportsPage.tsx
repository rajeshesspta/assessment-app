import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { createApiClient, SnapshotDetails, SnapshotSummary } from '../utils/api';

type ApiClient = ReturnType<typeof createApiClient>;

interface SnapshotReportsPageProps {
  api: ApiClient;
  brandPrimary?: string;
}

export function SnapshotReportsPage({ api, brandPrimary = '#4f46e5' }: SnapshotReportsPageProps) {
  const [summary, setSummary] = useState<SnapshotSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRefresh, setSummaryRefresh] = useState(0);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [customItemId, setCustomItemId] = useState('');
  const [details, setDetails] = useState<SnapshotDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setSummaryLoading(true);
    setSummaryError(null);
    api.fetchSnapshotSummary()
      .then(data => {
        if (!ignore) {
          setSummary(data);
        }
      })
      .catch(err => {
        if (!ignore) {
          setSummaryError(err.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setSummaryLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [api, summaryRefresh]);

  useEffect(() => {
    if (!summary?.perItem?.length) {
      return;
    }
    const fallbackId = summary.perItem[0].originalItemId;
    const hasCurrent = Boolean(selectedItemId && summary.perItem.some(item => item.originalItemId === selectedItemId));
    if (!hasCurrent && fallbackId) {
      setSelectedItemId(fallbackId);
    }
  }, [summary, selectedItemId]);

  useEffect(() => {
    if (!selectedItemId) {
      setDetails(null);
      setDetailsError(null);
      return;
    }
    let ignore = false;
    setDetailsLoading(true);
    setDetailsError(null);
    api.fetchSnapshotsByOriginalItem(selectedItemId)
      .then(data => {
        if (!ignore) {
          setDetails(data);
        }
      })
      .catch(err => {
        if (!ignore) {
          setDetailsError(err.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setDetailsLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [api, selectedItemId]);

  const sortedItems = useMemo(() => {
    if (!summary?.perItem) {
      return [];
    }
    return [...summary.perItem].sort((a, b) => b.count - a.count);
  }, [summary]);

  const selectedItemMeta = useMemo(() => {
    if (!summary?.perItem || !selectedItemId) return undefined;
    return summary.perItem.find(item => item.originalItemId === selectedItemId);
  }, [summary, selectedItemId]);

  const formatTimestamp = (value?: string) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const handleManualLookup = () => {
    if (customItemId.trim()) {
      setSelectedItemId(customItemId.trim());
    }
  };

  const refreshSummary = () => setSummaryRefresh(count => count + 1);

  const missingSnapshots = summary?.assessmentsMissingSnapshots ?? 0;
  const retentionStatus = missingSnapshots > 0 ? 'Action required' : 'Healthy';
  const retentionMessage = missingSnapshots > 0
    ? `${missingSnapshots} assessment${missingSnapshots === 1 ? '' : 's'} are still missing snapshots. Review the affected assessments, rerun snapshot creation, or trigger the nightly retention job so nothing is left unprotected.`
    : 'Every assessment currently has at least one snapshot. Keep watching this report so future edits are captured and retention can prune safely.';
  const retentionSubtext = missingSnapshots > 0
    ? 'Missing snapshots often mean a publish step was skipped or the snapshot job did not run; inspect per-item timelines or invoke `/snapshots/retention/enforce` with tenant policies.'
    : 'Retention enforcement is ready once configured; this report will surface any future gaps automatically.';

  return (
    <section className="space-y-8">
      <div
        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br p-6 text-white shadow-lg sm:p-10"
        style={{
          backgroundImage: `radial-gradient(circle at 10% -20%, ${brandPrimary}22, transparent 55%), radial-gradient(circle at 90% 0%, #0f172a33, transparent 60%), linear-gradient(135deg, ${brandPrimary}, #0f172a)`
        }}
      >
        <div className="absolute inset-0 opacity-50" aria-hidden />
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/80">Snapshot Reports</p>
              <h2 className="text-3xl font-bold">Tenant snapshot health</h2>
              <p className="text-sm text-white/80">Only tenant admins can see how frozen item tracks span across assessments.</p>
            </div>
            <button
              onClick={refreshSummary}
              className="flex items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/90 transition hover:bg-white/20"
            >
              <ArrowRight className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[{
              label: 'Total snapshots',
              value: summary?.totalSnapshots,
              helper: summaryLoading ? 'Loading…' : undefined,
              icon: <Sparkles className="h-5 w-5 text-white/70" />,
            }, {
              label: 'Unique items',
              value: summary?.uniqueItems,
              helper: summaryLoading ? 'Loading…' : undefined,
              icon: <ShieldCheck className="h-5 w-5 text-white/70" />,
            }, {
              label: 'Assessments with snapshots',
              value: summary?.assessmentsWithSnapshots,
              helper: summaryLoading ? 'Loading…' : undefined,
              icon: <BarChart3 className="h-5 w-5 text-white/70" />,
            }, {
              label: 'Assessments missing snapshots',
              value: summary?.assessmentsMissingSnapshots,
              helper: summaryLoading ? 'Loading…' : undefined,
              icon: <Clock3 className="h-5 w-5 text-white/70" />,
            }].map(card => (
              <article key={card.label} className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">{card.label}</span>
                  {card.icon}
                </div>
                <p className="mt-3 text-2xl font-semibold">{card.value ?? '—'}</p>
                {card.helper && <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/70">{card.helper}</p>}
              </article>
            ))}
          </div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/70">
            {summary ? (`Newest snapshot ${formatTimestamp(summary.newestSnapshotAt)} · Oldest snapshot ${formatTimestamp(summary.oldestSnapshotAt)}`) : (summaryLoading ? 'Loading timeline…' : 'No snapshot timeline yet')}
          </div>
        </div>
      </div>

      <div className={`rounded-[26px] border px-6 py-4 shadow-sm ${missingSnapshots > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.3em]">Retention status</p>
          <span className="text-[0.65rem] font-semibold tracking-[0.3em] text-slate-900">{retentionStatus}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">
          {retentionMessage}
        </p>
        <p className="mt-1 text-xs text-slate-700">{retentionSubtext}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4 rounded-[24px] border border-slate-200 bg-white/70 p-6 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Top snapshot items</p>
              <h3 className="text-xl font-semibold text-slate-900">Highest snapshot counts per item</h3>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Tenant admins only</span>
          </div>
          {summaryError && <p className="text-sm text-red-500">{summaryError}</p>}
          {summaryLoading ? (
            <p className="text-sm text-slate-500">Loading items…</p>
          ) : (!sortedItems.length ? (
            <p className="text-sm text-slate-500">No snapshots recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {sortedItems.slice(0, 6).map(item => (
                <li
                  key={item.originalItemId}
                  className={`flex items-center justify-between rounded-2xl border p-4 transition ${selectedItemId === item.originalItemId ? 'border-emerald-300 bg-emerald-50 shadow-lg' : 'border-slate-200 bg-white/90 hover:border-slate-300'}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900" title={item.itemTitle || item.originalItemId}>{item.itemTitle || 'Untitled item'}</p>
                    <p className="text-xs text-slate-500 break-all" title={item.originalItemId}>ID: {item.originalItemId}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[0.7rem] text-slate-500">
                      <span>{item.count} snapshot{item.count === 1 ? '' : 's'}</span>
                      {item.itemKind && (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-slate-500">{item.itemKind}</span>
                      )}
                    </div>
                    <p className="text-[0.65rem] text-slate-400">Newest: {formatTimestamp(item.newestSnapshotAt)}</p>
                  </div>
                  <button
                    onClick={() => setSelectedItemId(item.originalItemId)}
                    className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    View
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </section>

        <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-6 shadow-lg">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Item timeline</p>
            <h3 className="text-xl font-semibold text-slate-900">Inspect snapshots</h3>
            <p className="text-sm text-slate-500">Enter the item ID you want to audit or pick one from the list.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customItemId}
              onChange={event => setCustomItemId(event.target.value)}
              placeholder="Paste item ID"
              className="flex-1 rounded-2xl border border-slate-300 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <button
              onClick={handleManualLookup}
              disabled={!customItemId.trim()}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Load
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Current focus</p>
            {selectedItemId ? (
              <div className="mt-1 space-y-1">
                <p className="text-sm font-semibold text-slate-900" title={selectedItemMeta?.itemTitle || selectedItemId}>{selectedItemMeta?.itemTitle || 'Untitled item'}</p>
                {selectedItemMeta?.itemKind && (
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{selectedItemMeta.itemKind}</p>
                )}
                <p className="text-xs text-slate-500 break-all">ID: {selectedItemId}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">No item selected</p>
            )}
          </div>
          {detailsLoading && <p className="text-sm text-slate-500">Loading snapshots…</p>}
          {detailsError && <p className="text-sm text-red-500">{detailsError}</p>}
          {!detailsLoading && !details && !detailsError && (
            <p className="text-sm text-slate-500">Select an item to see its snapshot history.</p>
          )}
          {details && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <span>Total snapshots</span>
                <span>{details.totalSnapshots}</span>
              </div>
              <ul className="space-y-3">
                {details.snapshots.map(snapshot => (
                  <li key={snapshot.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">Snapshot {snapshot.id.slice(0, 8)}</span>
                      <span className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">{formatTimestamp(snapshot.createdAt)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Version: {snapshot.itemVersion ?? 'n/a'}</span>
                      <span>By: {snapshot.createdBy ?? 'system'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}