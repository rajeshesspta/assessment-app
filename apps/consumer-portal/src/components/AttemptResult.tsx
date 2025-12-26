import { ChevronLeft, CheckCircle, AlertCircle, Clock, Target } from 'lucide-react';
import type { AttemptResponse, Assessment, Item } from '../utils/api';
import { useEffect, useState } from 'react';
import { LoadingState } from './LoadingState';

interface AttemptResultProps {
  attemptId: string;
  api: any;
  brandPrimary?: string;
  onExit: () => void;
}

export function AttemptResult({ attemptId, api, brandPrimary = '#f97316', onExit }: AttemptResultProps) {
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const attemptData = await api.fetchAttempt(attemptId);
        setAttempt(attemptData);

        const assessmentData = await api.fetchAssessment(attemptData.assessmentId);
        setAssessment(assessmentData);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [attemptId, api]);

  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingState label="Loading results..." /></div>;
  if (error) return <div className="p-8 text-rose-600">Error: {error}</div>;
  if (!attempt || !assessment) return <div className="p-8">No data found.</div>;

  const isScored = attempt.status === 'scored';
  const isSubmitted = attempt.status === 'submitted';
  const scorePercentage = attempt.maxScore ? Math.round((attempt.score || 0) / attempt.maxScore * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">Assessment Results</h1>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-12">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Summary Card */}
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-center">
            {isScored ? (
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-6">
                <CheckCircle className="h-10 w-10" />
              </div>
            ) : (
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-sky-100 text-sky-600 mb-6">
                <Clock className="h-10 w-10" />
              </div>
            )}

            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isScored ? 'Assessment Completed!' : 'Submission Received'}
            </h2>
            <p className="text-slate-500 max-w-md mx-auto">
              {isScored 
                ? `You've successfully completed ${assessment.title}. Your results are available below.`
                : `Your responses for ${assessment.title} have been submitted. Some items may require manual grading.`}
            </p>

            {isScored && (
              <div className="mt-10 grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div className="rounded-2xl bg-slate-50 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Score</p>
                  <p className="text-3xl font-bold text-slate-900">{attempt.score} / {attempt.maxScore}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Percentage</p>
                  <p className="text-3xl font-bold" style={{ color: brandPrimary }}>{scorePercentage}%</p>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Target className="h-5 w-5 text-brand-500" />
                <h3 className="font-bold text-slate-900">Assessment Info</h3>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Title</dt>
                  <dd className="font-semibold text-slate-900">{assessment.title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Items</dt>
                  <dd className="font-semibold text-slate-900">{assessment.itemIds.length}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-5 w-5 text-brand-500" />
                <h3 className="font-bold text-slate-900">Attempt Info</h3>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-semibold text-slate-900 capitalize">{attempt.status.replace('_', ' ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Submitted At</dt>
                  <dd className="font-semibold text-slate-900">{new Date(attempt.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>

          {!isScored && (
            <div className="rounded-2xl bg-amber-50 p-6 border border-amber-200 flex gap-4">
              <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="font-bold text-amber-900">Pending Evaluation</h4>
                <p className="text-sm text-amber-800 mt-1">
                  This assessment contains items that require manual review or AI evaluation. 
                  Your final score will be updated once the review is complete.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              onClick={onExit}
              className="rounded-xl bg-slate-900 px-8 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
