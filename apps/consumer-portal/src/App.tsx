import { useCallback, useState } from 'react';
import { Header } from './components/Header';
import { TenantSessionForm } from './components/TenantSessionForm';
import { AssessmentPanel } from './components/AssessmentPanel';
import { AttemptList } from './components/AttemptList';
import { LoadingState } from './components/LoadingState';
import { useTenantSession } from './hooks/useTenantSession';
import { useApiClient } from './hooks/useApiClient';
import type { AssessmentAnalytics, AttemptResponse } from './utils/api';

export default function App() {
  const { session, saveSession, clearSession } = useTenantSession();
  const api = useApiClient(session);
  const [analytics, setAnalytics] = useState<AssessmentAnalytics | null>(null);
  const [attempts, setAttempts] = useState<AttemptResponse[]>([]);
  const [busyState, setBusyState] = useState<'idle' | 'loading' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);

  const ensureApi = useCallback(() => {
    if (!api) {
      throw new Error('Configure tenant session first.');
    }
    return api;
  }, [api]);

  async function lookupAssessment(assessmentId: string) {
    const client = ensureApi();
    setBusyState('loading');
    setError(null);
    try {
      const summary = await client.fetchAssessmentAnalytics(assessmentId);
      setAnalytics(summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyState('idle');
    }
  }

  async function startAttempt(assessmentId: string) {
    const client = ensureApi();
    setBusyState('submitting');
    setError(null);
    try {
      const attempt = await client.startAttempt(assessmentId);
      setAttempts(prev => [attempt, ...prev.filter(item => item.id !== attempt.id)]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyState('idle');
    }
  }

  async function refreshAttempt(attemptId: string) {
    const client = ensureApi();
    setBusyState('loading');
    setError(null);
    try {
      const attempt = await client.fetchAttempt(attemptId);
      setAttempts(prev => prev.map(item => (item.id === attempt.id ? attempt : item)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyState('idle');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4">
        <Header />
        <TenantSessionForm
          value={session}
          onSave={saveSession}
          onClear={() => {
            clearSession();
            setAnalytics(null);
            setAttempts([]);
          }}
        />
        {busyState !== 'idle' && (
          <div className="flex items-center justify-between rounded-2xl bg-white/90 p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
            <LoadingState label={busyState === 'loading' ? 'Syncing data' : 'Starting attempt'} />
            <p className="text-right">Requests fan out to the headless Fastify API through the BFF with tenant headers.</p>
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900">
            <strong className="text-sm font-semibold">Request failed</strong>
            <p className="text-sm">{error}</p>
          </div>
        )}
        <AssessmentPanel
          analytics={analytics}
          onLookup={lookupAssessment}
          onStartAttempt={startAttempt}
          disabled={!session || !api}
        />
        <AttemptList attempts={attempts} onRefresh={refreshAttempt} />
      </div>
    </div>
  );
}
