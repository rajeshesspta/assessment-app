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
  { id: 'my-assessments', label: 'My Assessments' },
  { id: 'overview', label: 'Overview' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div className="flex min-h-screen bg-midnight-900 text-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-6 border-r border-white/5 bg-midnight-800/90 p-6 backdrop-blur-xl transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brand-200">Portal</p>
            <p className="text-lg font-semibold text-white">Assessment App</p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-white/10 p-2 text-white transition hover:border-white/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {NAV_ITEMS.map(item => {
            const isActive = item.id === activeNav;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveNav(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive ? 'bg-white/90 text-midnight-700 shadow-glow' : 'bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {item.label}
                {isActive && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </button>
            );
          })}
        </div>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-200">Profile</p>
          <p className="mt-2 font-semibold text-white">{user.name}</p>
          <p className="text-sm text-slate-300">{user.email}</p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            onClick={() => {
              logout();
              setAnalytics(null);
              setAttempts([]);
            }}
          >
            Logout
          </button>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex flex-1 flex-col md:pl-72">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-midnight-800/70 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brand-200">Dashboard</p>
            <h1 className="text-2xl font-bold text-white">Welcome back, {user.name}</h1>
            <p className="text-sm text-slate-300">Signed in via {user.provider === 'custom' ? 'custom credentials' : user.provider === 'google' ? 'Google Workspace' : 'Microsoft Entra ID'} · {user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-2xl border border-white/10 p-3 text-white transition hover:border-white/40 md:hidden"
              aria-label="Toggle navigation"
              onClick={() => setSidebarOpen(prev => !prev)}
            >
              <span className="block h-0.5 w-6 bg-white" />
              <span className="mt-1 block h-0.5 w-6 bg-white" />
              <span className="mt-1 block h-0.5 w-6 bg-white" />
            </button>
            <span className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white md:flex">{user.name[0]?.toUpperCase() ?? 'U'}</span>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-midnight-900 via-midnight-900 to-midnight-800 px-6 py-8">
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
              <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 shadow-glow md:flex-row md:items-center md:justify-between">
                <LoadingState label={busyState === 'loading' ? 'Syncing data' : 'Starting attempt'} />
                <p className="text-right text-slate-300">Requests fan out to the headless API through the BFF with tenant headers.</p>
              </div>
            )}
            {error && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-100">
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
              <article key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-glow">
                <p className="text-sm font-semibold text-brand-200">{card.title}</p>
                <p className="mt-2 text-base text-slate-100">{card.body}</p>
              </article>
            ))}
          </section>
        )}
        {activeNav === 'analytics' && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-glow">
            <h2 className="text-lg font-semibold text-white">Analytics</h2>
            <p className="mt-2 text-sm text-slate-300">Live dashboards are coming soon. In the meantime, use the My Assessments tab to fetch attempt-level metrics.</p>
          </section>
        )}
        {activeNav === 'resources' && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-glow">
            <h2 className="text-lg font-semibold text-white">Resources</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
              <li>Assessment guidebook and best practices.</li>
              <li>Contact support to unlock cohorts or request accommodations.</li>
              <li>Explore self-paced practice banks curated by content authors.</li>
            </ul>
          </section>
        )}
        </main>
      </div>
    </div>
  );
}
