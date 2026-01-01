import { useEffect, useState } from 'react';
import type { Assessment } from '../utils/api';
import { createApiClient } from '../utils/api';
import { useTenantSession } from '../hooks/useTenantSession';

export function AssessmentSnapshots({ assessment }: { assessment: Assessment }) {
  const { session } = useTenantSession();
  const api = createApiClient(session ?? { apiBaseUrl: '/api', actorRoles: ['LEARNER'], userId: '', tenantId: '' });
  const [snapshots, setSnapshots] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.fetchAssessmentSnapshots(assessment.id)
      .then(s => { if (mounted) setSnapshots(s); })
      .catch(() => { if (mounted) setSnapshots([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [assessment.id]);

  async function handleResnapshot() {
    setLoading(true);
    try {
      const res = await api.resnapshotAssessment(assessment.id);
      setSnapshots(res.snapshotIds.map((id: string) => ({ id })));
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium">Snapshots</h5>
        <button onClick={handleResnapshot} className="text-xs text-blue-600">{loading ? 'Working…' : 'Resnapshot'}</button>
      </div>
      {snapshots === null ? (
        <div className="text-sm text-slate-500">Loading snapshots…</div>
      ) : snapshots.length === 0 ? (
        <div className="text-sm text-slate-500">No snapshots</div>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {snapshots.map(s => (
            <li key={s.id} className="flex items-center justify-between">
              <div className="text-slate-700">Snapshot {s.id}</div>
              <a className="text-blue-600" href={`/api/snapshots/${s.id}`} target="_blank" rel="noreferrer">Preview</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
