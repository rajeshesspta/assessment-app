import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Pin, PinOff } from 'lucide-react';
import { TenantSessionForm } from './components/TenantSessionForm';
import { AssessmentPanel } from './components/AssessmentPanel';
import { AttemptList } from './components/AttemptList';
import { LoadingState } from './components/LoadingState';
import { ItemBankPage } from './components/ItemBankPage';
import { AssessmentsPage } from './components/AssessmentsPage';
import { LearnersPage } from './components/LearnersPage';
import { AssessmentPlayer } from './components/AssessmentPlayer';
import { AttemptResult } from './components/AttemptResult';
import { useTenantSession } from './hooks/useTenantSession';
import { useApiClient } from './hooks/useApiClient';
import type { AssessmentAnalytics, AttemptResponse } from './utils/api';
import { usePortalAuth } from './hooks/usePortalAuth';
import { LoginPage } from './components/LoginPage';
import { useTenantConfig } from './context/TenantConfigContext';
import { buildBffUrl, isBffEnabled } from './utils/bff';

type NavItem = {
  id: string;
  label: string;
  path: string;
  requiresTenantAdmin?: boolean;
  requiresContentAuthor?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'my-assessments', label: 'My Assessments', path: '/my-assessments' },
  { id: 'manage-assessments', label: 'Assessments', path: '/manage-assessments', requiresContentAuthor: true },
  { id: 'item-bank', label: 'Item Bank', path: '/item-bank', requiresContentAuthor: true },
  { id: 'learners', label: 'Learners', path: '/learners', requiresContentAuthor: true },
  { id: 'overview', label: 'Overview', path: '/overview' },
  { id: 'analytics', label: 'Analytics', path: '/analytics' },
  { id: 'manage-learners', label: 'Manage Learners', path: '/manage-learners', requiresTenantAdmin: true },
  { id: 'resources', label: 'Resources', path: '/resources' },
];

const LANDING_NAV_ID = 'overview';
const LANDING_PATH = NAV_ITEMS.find(item => item.id === LANDING_NAV_ID)?.path ?? '/my-assessments';

function withAlpha(hex: string, alpha: number) {
  const normalized = hex?.startsWith('#') ? hex.slice(1) : hex;
  if (normalized.length !== 6) {
    return hex;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type LearnerStatus = 'Active' | 'Invited';

interface LearnerRosterEntry {
  id: string;
  name: string;
  email: string;
  cohort: string;
  status: LearnerStatus;
}

export default function App() {
  const { user, loginWithProvider, loginCustom, logout, checkingSession } = usePortalAuth();
  const { session, saveSession, clearSession } = useTenantSession();
  const { config, loading: tenantConfigLoading, error: tenantConfigError } = useTenantConfig();
  const api = useApiClient(session);
  const location = useLocation();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AssessmentAnalytics | null>(null);
  const [attempts, setAttempts] = useState<AttemptResponse[]>([]);
  const [busyState, setBusyState] = useState<'idle' | 'loading' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [viewingAttemptId, setViewingAttemptId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [learnerRoster, setLearnerRoster] = useState<LearnerRosterEntry[]>(() => ([
    {
      id: 'learner-101',
      name: 'Mia Chen',
      email: 'mia.chen@example.com',
      cohort: 'Northwind Analytics',
      status: 'Active',
    },
    {
      id: 'learner-203',
      name: 'Evan Patel',
      email: 'evan.patel@example.com',
      cohort: 'Retail Ops',
      status: 'Invited',
    },
    {
      id: 'learner-305',
      name: 'Priya Rao',
      email: 'priya.rao@example.com',
      cohort: 'Healthcare Pilot',
      status: 'Active',
    },
  ]));
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', cohort: '' });

  const tenantName = config?.name ?? 'Assessment App';
  const supportEmail = config?.supportEmail ?? 'support@example.com';
  const brandPrimary = config?.branding.primaryColor ?? '#f97316';
  const brandAccent = config?.branding.accentColor ?? '#fb923c';
  const brandLabelStyle = useMemo(() => ({ color: brandPrimary }), [brandPrimary]);
  const brandBadgeStyle = useMemo(() => ({
    borderColor: withAlpha(brandPrimary, 0.24),
    backgroundColor: withAlpha(brandPrimary, 0.08),
    color: brandPrimary,
  }), [brandPrimary]);
  const brandButtonStyle = useMemo(() => ({
    backgroundColor: brandPrimary,
    borderColor: brandPrimary,
  }), [brandPrimary]);
  const shouldShowConfigWarning = Boolean(tenantConfigError);

  const isTenantAdmin = useMemo(() => {
    const sessionHas = session?.actorRoles?.some(role => role.toUpperCase() === 'TENANT_ADMIN');
    const userHas = user?.roles?.some(role => role.toUpperCase() === 'TENANT_ADMIN');
    return Boolean(sessionHas || userHas);
  }, [session, user]);

  const isContentAuthor = useMemo(() => {
    const sessionHas = session?.actorRoles?.some(role => role.toUpperCase() === 'CONTENT_AUTHOR');
    const userHas = user?.roles?.some(role => role.toUpperCase() === 'CONTENT_AUTHOR');
    return Boolean(sessionHas || userHas);
  }, [session, user]);

  const normalizedPath = location.pathname.length > 1 && location.pathname.endsWith('/')
    ? location.pathname.replace(/\/+/g, '/').replace(/\/+$/, '')
    : location.pathname;
  const currentNav = useMemo(
    () => NAV_ITEMS.find(item => item.path === normalizedPath) ?? null,
    [normalizedPath],
  );
  const activeNav = currentNav?.id ?? LANDING_NAV_ID;

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter(item => {
      if (item.requiresTenantAdmin && !isTenantAdmin) return false;
      if (item.requiresContentAuthor && !isContentAuthor && !isTenantAdmin) return false;
      return true;
    }),
    [isTenantAdmin, isContentAuthor],
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    if (location.pathname === '/') {
      navigate(LANDING_PATH, { replace: true });
    }
  }, [user, location.pathname, navigate]);

  useEffect(() => {
    if (user && isBffEnabled()) {
      const rolesChanged = JSON.stringify(session?.actorRoles) !== JSON.stringify(user.roles);
      const userChanged = session?.userId !== user.id;
      
      if (!session || rolesChanged || userChanged) {
        saveSession({
          apiBaseUrl: buildBffUrl('/api'),
          actorRoles: user.roles,
          userId: user.id,
        });
      }
    }
  }, [user, session, saveSession]);

  const canSendInvite = inviteForm.name.trim().length > 0
    && inviteForm.email.trim().length > 0
    && inviteForm.email.includes('@');

  const ensureApi = useCallback(() => {
    if (!api) {
      throw new Error('Configure tenant session first.');
    }
    return api;
  }, [api]);

  const toggleSidebarPinned = useCallback(() => {
    setSidebarPinned(prev => {
      const next = !prev;
      if (next) {
        setSidebarOpen(false);
      }
      return next;
    });
  }, []);

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
      setActiveAttemptId(attempt.id);
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

  const MyAssessmentsPage = () => (
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
        <div className="flex flex-col gap-2 rounded-2xl border border-brand-50 bg-white p-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <LoadingState label={busyState === 'loading' ? 'Syncing data' : 'Starting attempt'} />
          <p className="text-right text-slate-500">Requests fan out to the headless API through the BFF with tenant headers.</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
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
      <AttemptList
        attempts={attempts}
        onRefresh={refreshAttempt}
        onContinue={(id) => setActiveAttemptId(id)}
        onViewResults={(id) => setViewingAttemptId(id)}
      />
    </>
  );

  const OverviewPage = () => (
    <section className="grid gap-4 md:grid-cols-3">
      {overviewCards.map(card => (
        <article key={card.title} className="rounded-2xl border border-brand-50 bg-white p-5">
          <p className="text-sm font-semibold text-brand-600">{card.title}</p>
          <p className="mt-2 text-base text-slate-600">{card.body}</p>
        </article>
      ))}
    </section>
  );

  const AnalyticsPage = () => (
    <section className="rounded-2xl border border-brand-50 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
      <p className="mt-2 text-sm text-slate-600">Live dashboards are coming soon. In the meantime, use the My Assessments tab to fetch attempt-level metrics.</p>
    </section>
  );

  const ManageLearnersPage = () => (
    <section className="space-y-6">
      <div className="rounded-3xl border border-brand-50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-500">Tenant Admin</p>
            <h2 className="text-2xl font-semibold text-slate-900">Invite learners</h2>
            <p className="text-sm text-slate-600">Provision cohorts in the BFF and fan out invites via the tenant API.</p>
          </div>
        </div>
        <form
          className="mt-6 grid gap-4 md:grid-cols-3"
          onSubmit={event => {
            event.preventDefault();
            if (!canSendInvite) {
              return;
            }
            setLearnerRoster(prev => [
              {
                id: `learner-${Date.now()}`,
                name: inviteForm.name.trim(),
                email: inviteForm.email.trim(),
                cohort: inviteForm.cohort.trim() || 'Unassigned Cohort',
                status: 'Invited',
              },
              ...prev,
            ]);
            setInviteForm({ name: '', email: '', cohort: '' });
          }}
        >
          <label className="text-sm font-medium text-slate-700">
            Full name
            <input
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              placeholder="Ada Lovelace"
              value={inviteForm.name}
              onChange={event => setInviteForm(prev => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email
            <input
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-brand-500"
              type="email"
              placeholder="ada@example.com"
              value={inviteForm.email}
              onChange={event => setInviteForm(prev => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Cohort tag
            <input
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              placeholder="APAC Growth Sprint"
              value={inviteForm.cohort}
              onChange={event => setInviteForm(prev => ({ ...prev, cohort: event.target.value }))}
            />
          </label>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={!canSendInvite}
              className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send invite
            </button>
          </div>
        </form>
      </div>
      <div className="rounded-3xl border border-brand-50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-500">Roster</p>
            <h3 className="text-xl font-semibold text-slate-900">Learner directory</h3>
            <p className="text-sm text-slate-600">Keep cohorts synchronized with the headless API before releasing new assessments.</p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Cohort</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {learnerRoster.map(entry => (
                <tr key={entry.id} className="text-slate-900">
                  <td className="py-3 pr-4 font-medium">{entry.name}</td>
                  <td className="py-3 pr-4 text-slate-500">{entry.email}</td>
                  <td className="py-3 pr-4 text-slate-500">{entry.cohort}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      entry.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right text-xs font-semibold">
                    {entry.status === 'Invited' && (
                      <button
                        type="button"
                        className="mr-2 rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-900"
                        onClick={() => setLearnerRoster(prev => prev.map(item => (item.id === entry.id ? { ...item, status: 'Active' } : item)))}
                      >
                        Mark active
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
                      onClick={() => setLearnerRoster(prev => prev.filter(item => item.id !== entry.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );

  const ResourcesPage = () => (
    <section className="space-y-4 rounded-2xl border border-brand-50 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Resources</h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
        <li>Assessment guidebook and best practices.</li>
        <li>Contact support to unlock cohorts or request accommodations.</li>
        <li>Explore self-paced practice banks curated by content authors.</li>
      </ul>
    </section>
  );

  if (tenantConfigLoading || checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sunrise-50 text-slate-700">
        <LoadingState label={tenantConfigLoading ? 'Loading tenant configuration' : 'Restoring session'} />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        tenantName={tenantName}
        supportEmail={supportEmail}
        branding={config?.branding}
        onProviderLogin={loginWithProvider}
        onCustomLogin={({ name, email, roles }) => loginCustom(name, email, roles)}
      />
    );
  }

  const isSidebarVisible = sidebarPinned || sidebarOpen;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-sunrise-50 via-white to-sunrise-100 text-slate-900">
      {activeAttemptId && (
        <AssessmentPlayer
          attemptId={activeAttemptId}
          api={api}
          brandPrimary={brandPrimary}
          onComplete={(attempt) => {
            setAttempts(prev => prev.map(a => a.id === attempt.id ? attempt : a));
            setActiveAttemptId(null);
          }}
          onExit={() => setActiveAttemptId(null)}
        />
      )}
      {viewingAttemptId && (
        <AttemptResult
          attemptId={viewingAttemptId}
          api={api}
          brandPrimary={brandPrimary}
          onExit={() => setViewingAttemptId(null)}
        />
      )}
      <aside
        id="portal-sidebar"
        aria-hidden={!isSidebarVisible}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-6 border border-brand-50/60 bg-white/95 p-6 backdrop-blur-xl transition-transform duration-200 ${
          isSidebarVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brand-500" style={brandLabelStyle}>Tenant</p>
            <p className="text-lg font-semibold text-slate-900">{tenantName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-xl border p-2 transition ${
                sidebarPinned
                  ? 'border-brand-200 text-brand-600 hover:border-brand-300'
                  : 'border-slate-200 text-slate-500 hover:border-brand-200 hover:text-brand-600'
              }`}
              aria-pressed={sidebarPinned}
              aria-label={sidebarPinned ? 'Unpin sidebar navigation' : 'Pin sidebar navigation'}
              title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              onClick={toggleSidebarPinned}
            >
              {sidebarPinned ? (
                <PinOff className="h-5 w-5 transition duration-200" strokeWidth={1.5} />
              ) : (
                <Pin className="h-5 w-5 transition duration-200" strokeWidth={1.5} />
              )}
              <span className="sr-only">{sidebarPinned ? 'Unpin sidebar navigation' : 'Pin sidebar navigation'}</span>
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              onClick={() => {
                setSidebarPinned(false);
                setSidebarOpen(false);
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {visibleNavItems.map(item => {
            const isActive = item.id === activeNav;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (location.pathname !== item.path) {
                    navigate(item.path);
                  }
                  if (!sidebarPinned) {
                    setSidebarOpen(false);
                  }
                }}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'border-brand-100 bg-brand-50 text-brand-700'
                    : 'border-transparent bg-white text-slate-500 hover:border-brand-100 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </button>
            );
          })}
        </div>
        <div className="mt-auto rounded-2xl border border-brand-50 bg-sunrise-50 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-500">Profile</p>
          <p className="mt-2 font-semibold text-slate-900">{user.name}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
          {supportEmail && (
            <p className="text-xs text-slate-500">
              Support:{' '}
              <a href={`mailto:${supportEmail}`} className="font-semibold" style={brandLabelStyle}>
                {supportEmail}
              </a>
            </p>
          )}
          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
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
      {sidebarOpen && !sidebarPinned && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/10"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`flex flex-1 flex-col ${sidebarPinned ? 'md:pl-72' : ''}`}>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-brand-50/80 bg-white/80 px-6 py-4 backdrop-blur-xl">
          <div className="flex flex-1 items-center gap-4">
            <button
              type="button"
              className="rounded-2xl border border-slate-200 p-3 text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
              aria-label="Toggle navigation"
              aria-expanded={isSidebarVisible}
              aria-controls="portal-sidebar"
              onClick={() => {
                if (sidebarPinned) {
                  setSidebarPinned(false);
                  setSidebarOpen(false);
                } else {
                  setSidebarOpen(prev => !prev);
                }
              }}
            >
              <span className="block h-0.5 w-6 bg-slate-700" />
              <span className="mt-1 block h-0.5 w-6 bg-slate-700" />
              <span className="mt-1 block h-0.5 w-6 bg-slate-700" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brand-500" style={brandLabelStyle}>{tenantName}</p>
              <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user.name}</h1>
              <p className="text-sm text-slate-600">
                Signed in via {
                  user.provider === 'custom'
                    ? 'custom credentials'
                    : user.provider === 'google'
                      ? 'Google Workspace'
                      : user.provider === 'microsoft'
                        ? 'Microsoft Entra ID'
                        : 'Enterprise SSO'
                } · {user.email}
              </p>
            </div>
          </div>
          <span className="hidden h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-lg font-semibold text-brand-600 md:flex">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              user.name[0]?.toUpperCase() ?? 'U'
            )}
          </span>
        </header>
        <main className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-white via-sunrise-50 to-sunrise-100 px-6 py-8">
          {shouldShowConfigWarning && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Using cached branding</p>
              <p className="text-xs text-amber-700">{tenantConfigError}</p>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to={LANDING_PATH} replace />} />
            <Route path={LANDING_PATH} element={<MyAssessmentsPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route
              path="/item-bank"
              element={(isContentAuthor || isTenantAdmin) ? <ItemBankPage api={api} brandPrimary={brandPrimary} brandLabelStyle={brandLabelStyle} /> : <Navigate to={LANDING_PATH} replace />}
            />
            <Route
              path="/manage-assessments"
              element={(isContentAuthor || isTenantAdmin) ? <AssessmentsPage api={api} brandPrimary={brandPrimary} brandLabelStyle={brandLabelStyle} /> : <Navigate to={LANDING_PATH} replace />}
            />
            <Route
              path="/learners"
              element={(isContentAuthor || isTenantAdmin) ? <LearnersPage api={api} brandPrimary={brandPrimary} /> : <Navigate to={LANDING_PATH} replace />}
            />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route
              path="/manage-learners"
              element={isTenantAdmin ? <ManageLearnersPage /> : <Navigate to={LANDING_PATH} replace />}
            />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="*" element={<Navigate to={LANDING_PATH} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
