import { useCallback, useMemo, useState } from 'react';
import { TenantSessionForm } from './components/TenantSessionForm';
import { AssessmentPanel } from './components/AssessmentPanel';
import { AttemptList } from './components/AttemptList';
import { LoadingState } from './components/LoadingState';
import { useTenantSession } from './hooks/useTenantSession';
import { useApiClient } from './hooks/useApiClient';
import type { AssessmentAnalytics, AttemptResponse } from './utils/api';
import { usePortalAuth } from './hooks/usePortalAuth';
import { LoginPage } from './components/LoginPage';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'my-assessments', label: 'My Assessments' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'resources', label: 'Resources' },
];

export default function App() {
  const { user, loginWithProvider, loginCustom, logout } = usePortalAuth();
  const { session, saveSession, clearSession } = useTenantSession();
  const api = useApiClient(session);
  const [analytics, setAnalytics] = useState<AssessmentAnalytics | null>(null);
  const [attempts, setAttempts] = useState<AttemptResponse[]>([]);
  const [busyState, setBusyState] = useState<'idle' | 'loading' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>('my-assessments');

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

  const overviewCards = useMemo(() => ([
    { title: 'Upcoming attempts', body: 'Track scheduled launches across cohorts.' },
    { title: 'Instructor messages', body: 'Stay aligned with facilitator updates.' },
    { title: 'Assessment library', body: 'Explore practice sets curated by authors.' },
  ]), []);

  if (!user) {
    return (
      <LoginPage
        onProviderLogin={loginWithProvider}
        onCustomLogin={({ name, email }) => loginCustom(name, email)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white/95 shadow-sm ring-1 ring-slate-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Assessment Platform</p>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user.name}</h1>
            <p className="text-sm text-slate-500">Signed in via {user.provider === 'custom' ? 'custom credentials' : user.provider === 'google' ? 'Google Workspace' : 'Microsoft Entra ID'} · {user.email}</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-100/70 p-3">
            <div className="hidden text-right text-sm md:block">
              <p className="font-semibold text-slate-700">{user.name}</p>
              <p className="text-xs text-slate-500">Learner</p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">{user.name[0]?.toUpperCase() ?? 'U'}</span>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
              onClick={() => {
                logout();
                setAnalytics(null);
                setAttempts([]);
              }}
            >
              Logout
            </button>
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-5xl gap-2 overflow-x-auto px-4 pb-4">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${activeNav === item.id ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        {activeNav === 'my-assessments' && (
          <>
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
              <div className="flex flex-col gap-2 rounded-2xl bg-white/90 p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100 md:flex-row md:items-center md:justify-between">
                <LoadingState label={busyState === 'loading' ? 'Syncing data' : 'Starting attempt'} />
                <p className="text-right">Requests fan out to the headless API through the BFF with tenant headers.</p>
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
          </>
        )}
        {activeNav === 'overview' && (
          <section className="grid gap-4 md:grid-cols-3">
            {overviewCards.map(card => (
              <article key={card.title} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">{card.title}</p>
                <p className="mt-2 text-base text-slate-900">{card.body}</p>
              </article>
            ))}
          </section>
        )}
        {activeNav === 'analytics' && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
            <p className="mt-2 text-sm text-slate-500">Live dashboards are coming soon. In the meantime, use the My Assessments tab to fetch attempt-level metrics.</p>
          </section>
        )}
        {activeNav === 'resources' && (
          <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Resources</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
              <li>Assessment guidebook and best practices.</li>
              <li>Contact support to unlock cohorts or request accommodations.</li>
              <li>Explore self-paced practice banks curated by content authors.</li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
