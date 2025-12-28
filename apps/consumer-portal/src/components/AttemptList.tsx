import { useEffect, useState } from 'react';
import type { AttemptResponse } from '../utils/api';

interface AttemptListProps {
  attempts: AttemptResponse[];
  api: any;
  onRefresh: (attemptId: string) => Promise<void> | void;
  onContinue: (attemptId: string) => void;
  onViewResults: (attemptId: string) => void;
}

export function AttemptList({ attempts, api, onRefresh, onContinue, onViewResults }: AttemptListProps) {
  const [assessments, setAssessments] = useState<Record<string, { title: string }>>({});

  useEffect(() => {
    if (!attempts.length || !api) return;

    const assessmentIds = Array.from(new Set(attempts.map(a => a.assessmentId)));
    Promise.all(assessmentIds.map(async (id) => {
      try {
        const a = await api.fetchAssessment(id);
        return { id, title: a.title };
      } catch (e) {
        console.error(`Failed to fetch assessment ${id}`, e);
        return { id, title: `Assessment ${id}` };
      }
    })).then(results => {
      const map: Record<string, { title: string }> = {};
      results.forEach(({ id, title }) => map[id] = { title });
      setAssessments(map);
    });
  }, [attempts, api]);

  if (!attempts.length) {
    return (
      <section className="rounded-2xl bg-white/90 p-6 ring-1 ring-slate-100 backdrop-blur">
        <h2 className="text-xl font-semibold text-slate-900">Attempts</h2>
        <p className="mt-2 text-sm text-slate-500">Start an attempt to track live progress. Attempts started here are cached locally for convenience.</p>
      </section>
    );
  }

  const groupedAttempts = attempts.reduce((acc, attempt) => {
    if (!acc[attempt.assessmentId]) acc[attempt.assessmentId] = [];
    acc[attempt.assessmentId].push(attempt);
    return acc;
  }, {} as Record<string, AttemptResponse[]>);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Attempts</h2>
      {Object.entries(groupedAttempts).map(([assessmentId, attemptsForAssessment]) => (
        <section key={assessmentId} className="rounded-2xl bg-white/90 p-6 ring-1 ring-slate-100 backdrop-blur">
          <h3 className="text-lg font-semibold text-slate-900">{assessments[assessmentId]?.title || `Assessment ${assessmentId}`}</h3>
          <div className="mt-4 space-y-4">
            {attemptsForAssessment.map(attempt => (
              <article key={attempt.id} className="rounded-2xl border border-slate-100 p-4 transition hover:border-brand-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Attempt #{attempt.id}</p>
                  </div>
                  <StatusPill status={attempt.status} />
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <ListRow label="Score" value={typeof attempt.score === 'number' ? `${attempt.score}/${attempt.maxScore ?? '—'}` : '—'} />
                  <ListRow label="Learner" value={attempt.userId} />
                  <ListRow label="Updated" value={new Date(attempt.updatedAt).toLocaleString()} />
                </dl>
                <div className="mt-4 flex gap-2">
                  {attempt.status === 'in_progress' && (
                    <button
                      type="button"
                      onClick={() => onContinue(attempt.id)}
                      className="inline-flex items-center rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                    >
                      Continue
                    </button>
                  )}
                  {(attempt.status === 'submitted' || attempt.status === 'scored') && (
                    <button
                      type="button"
                      onClick={() => onViewResults(attempt.id)}
                      className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      View Results
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRefresh(attempt.id)}
                    className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    Refresh status
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ListRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: AttemptResponse['status'] }) {
  const palette: Record<AttemptResponse['status'], { label: string; classes: string }> = {
    in_progress: { label: 'In progress', classes: 'bg-orange-100 text-orange-700' },
    submitted: { label: 'Submitted', classes: 'bg-sky-100 text-sky-700' },
    scored: { label: 'Scored', classes: 'bg-emerald-100 text-emerald-700' },
  };
  const style = palette[status];
  return (
    <span className={`rounded-full px-4 py-1 text-sm font-semibold ${style.classes}`}>
      {style.label}
    </span>
  );
}
