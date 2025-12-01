import { FormEvent, useState } from 'react';
import type { AssessmentAnalytics } from '../utils/api';

interface AssessmentPanelProps {
  analytics: AssessmentAnalytics | null;
  onLookup: (assessmentId: string) => Promise<void> | void;
  onStartAttempt: (assessmentId: string) => Promise<void> | void;
  disabled?: boolean;
}

export function AssessmentPanel({ analytics, onLookup, onStartAttempt, disabled }: AssessmentPanelProps) {
  const [assessmentId, setAssessmentId] = useState('');

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    if (!assessmentId) {
      return;
    }
    await onLookup(assessmentId);
  }

  async function handleStartAttempt() {
    if (!assessmentId) {
      return;
    }
    await onStartAttempt(assessmentId);
  }

  return (
    <section className="rounded-2xl bg-white/90 p-6 ring-1 ring-slate-100 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Assessment lookup</h2>
          <p className="text-sm text-slate-500">Fetch tenant analytics or immediately trigger a learner attempt.</p>
        </div>
        <form className="flex flex-wrap items-center gap-3" onSubmit={handleLookup}>
          <input
            type="text"
            placeholder="assessment-id"
            className="w-48 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={assessmentId}
            onChange={event => setAssessmentId(event.target.value)}
          />
          <button
            type="submit"
            disabled={disabled || !assessmentId}
            className="inline-flex items-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fetch analytics
          </button>
          <button
            type="button"
            disabled={disabled || !assessmentId}
            onClick={handleStartAttempt}
            className="inline-flex items-center rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Start attempt
          </button>
        </form>
      </div>
      <div className="mt-6">
        {analytics ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Assessment" value={analytics.assessmentTitle ?? analytics.assessmentId} subtle />
            <Metric label="Total attempts" value={analytics.attempts.toString()} />
            <Metric label="Average score" value={analytics.averageScore !== null ? `${analytics.averageScore.toFixed(2)}%` : '—'} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Look up an assessment to view tenant analytics and kick off an attempt.</p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value, subtle = false }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        subtle ? 'bg-slate-50' : 'bg-gradient-to-br from-brand-50 via-white to-white'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
