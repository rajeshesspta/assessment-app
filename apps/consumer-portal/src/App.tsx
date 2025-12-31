import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Pin, PinOff, ChevronRight, ChevronDown } from 'lucide-react';
import { TenantSessionForm } from './components/TenantSessionForm';
import { AssessmentPanel } from './components/AssessmentPanel';
import { AssignedAssessmentsList } from './components/AssignedAssessmentsList';
import { CompletedAssessmentsList } from './components/CompletedAssessmentsList';
import { LoadingState } from './components/LoadingState';
import { ItemBankPage } from './components/ItemBankPage';
import { AssessmentsPage } from './components/AssessmentsPage';
import { LearnersPage } from './components/LearnersPage';
import { CohortsPage } from './components/CohortsPage';
import { UsersPage } from './components/UsersPage';
import { AssessmentPlayer } from './components/AssessmentPlayer';
import { AttemptResult } from './components/AttemptResult';
import { LearnerDashboard } from './components/LearnerDashboard';
import { ContentAuthorDashboard } from './components/ContentAuthorDashboard';
import { Breadcrumb } from './components/Breadcrumb';
import { TaxonomyConfigPage } from './components/TaxonomyConfigPage';
import { useTenantSession } from './hooks/useTenantSession';
import { useApiClient } from './hooks/useApiClient';
import { usePortalAuth } from './hooks/usePortalAuth';
import { useTenantConfig } from './context/TenantConfigContext';
import { buildBffUrl, isBffEnabled } from './utils/bff';
import { LoginPage } from './components/LoginPage';
import AssessmentResultPage from './pages/AssessmentResultPage';

type NavItem = {
  id: string;
  label: string;
  path?: string;
  requiresTenantAdmin?: boolean;
  requiresContentAuthor?: boolean;
  children?: NavItem[];
};

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', path: '/overview' },
  { id: 'my-assessments', label: 'My Assessments', path: '/my-assessments' },
  { id: 'manage-assessments', label: 'Assessments', path: '/manage-assessments', requiresContentAuthor: true },
  { id: 'item-bank', label: 'Item Bank', path: '/item-bank', requiresContentAuthor: true },
  { id: 'learners', label: 'Learners', path: '/learners', requiresContentAuthor: true },
  { id: 'cohorts', label: 'Cohorts', path: '/cohorts', requiresContentAuthor: true },
  { id: 'users', label: 'Users', path: '/users', requiresTenantAdmin: true },
  { id: 'analytics', label: 'Analytics', path: '/analytics' },
  { id: 'resources', label: 'Resources', path: '/resources' },
  { id: 'settings', label: 'Settings', requiresTenantAdmin: true, children: [
    { id: 'taxonomy-config', label: 'Taxonomy Config', path: '/taxonomy-config' }
  ] },
];

const LANDING_NAV_ID = 'overview';
const LANDING_PATH = '/overview';

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

export default function App() {
  const { user, loginWithProvider, loginCustom, logout, checkingSession } = usePortalAuth();
  const { session, saveSession, clearSession } = useTenantSession();
  const { config, loading: tenantConfigLoading, error: tenantConfigError } = useTenantConfig();
  const api = useApiClient(session);

  const ensureApi = useCallback(() => {
    if (!api) {
      throw new Error('API client not available');
    }
    return api;
  }, [api]);
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
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

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
  const findActiveItem = (items: NavItem[]): NavItem | null => {
    for (const item of items) {
      if (item.path === normalizedPath) return item;
      if (item.children) {
        const child = findActiveItem(item.children);
        if (child) return child;
      }
    }
    return null;
  };

  const currentNav = useMemo(
    () => findActiveItem(NAV_ITEMS) ?? NAV_ITEMS.find(item => item.id === LANDING_NAV_ID) ?? null,
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
    const parent = visibleNavItems.find(item => item.children?.some(c => c.id === activeNav));
    if (parent) {
      setExpandedMenus(prev => new Set(prev).add(parent.id));
    }
  }, [activeNav, visibleNavItems]);

  // Determine breadcrumb items based on current route
  const breadcrumbItems = useMemo(() => {
    const path = location.pathname;

    if (path === '/my-assessments') {
      return [{ label: 'My Assessments' }];
    }

    if (path === '/my-assessments/completed') {
      return [
        { label: 'My Assessments', path: '/my-assessments' },
        { label: 'Completed Assessments' }
      ];
    }

    if (path.startsWith('/assessment/')) {
      const assessmentId = path.split('/assessment/')[1];
      return [
        { label: 'My Assessments', path: '/my-assessments' },
        { label: 'Assessment Details' }
      ];
    }

    // For other routes, just show the current page name
    const currentNav = findActiveItem(NAV_ITEMS);
    if (currentNav) {
      const parent = NAV_ITEMS.find(item => item.children?.some(c => c.id === currentNav.id));
      if (parent) {
        return [{ label: parent.label }, { label: currentNav.label }];
      } else {
        return [{ label: currentNav.label }];
      }
    }

    return [];
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (location.pathname === '/') {
      navigate(LANDING_PATH, { replace: true });
    }
  }, [user, location.pathname, navigate]);

  useEffect(() => {
    if (!checkingSession && !user && location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [checkingSession, user, location.pathname, navigate]);

  useEffect(() => {
    console.log('Session save effect:', { user: !!user, isBffEnabled: isBffEnabled(), configHeadlessTenantId: config?.headlessTenantId, session: !!session });
    if (user && isBffEnabled()) {
      const tenantId = config?.headlessTenantId || 'dev-tenant';
      const rolesChanged = JSON.stringify(session?.actorRoles) !== JSON.stringify(user.roles);
      const userChanged = session?.userId !== user.id;
      const tenantChanged = session?.tenantId !== tenantId;
      
      console.log('Session save check:', { rolesChanged, userChanged, tenantChanged, userRoles: user.roles, tenantId });
      if (!session || rolesChanged || userChanged || tenantChanged) {
        console.log('Saving session with roles:', user.roles, 'tenantId:', tenantId);
        saveSession({
          apiBaseUrl: buildBffUrl('/api'),
          actorRoles: user.roles,
          userId: user.id,
          tenantId,
        });
      }
    }
  }, [user, session, saveSession, config?.headlessTenantId]);

  useEffect(() => {
    if (user && api) {
      api.fetchAttempts().then(setAttempts).catch(console.error);
    }
  }, [user, api]);

  const combinedLogout = useCallback(async () => {
    await logout();
    clearSession();
  }, [logout, clearSession]);

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



  const MyAssessmentsPage = () => (
    <>
      <AssignedAssessmentsList
        api={api}
        userId={user.id}
        onStartAttempt={startAttempt}
        onContinue={(id) => setActiveAttemptId(id)}
        attempts={attempts}
      />
    </>
  );

  const CompletedAssessmentsPage = () => (
    <>
      <CompletedAssessmentsList
        api={api}
        userId={user.id}
        attempts={attempts}
      />
    </>
  );

  const OverviewPage = () => {
    console.log('OverviewPage render:', { user, session, isContentAuthor, isTenantAdmin });
    if (!api) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"></div>
            <p className="mt-2 text-sm text-slate-600">Setting up session...</p>
          </div>
        </div>
      );
    }

    if (isContentAuthor) {
      return (
        <ContentAuthorDashboard
          api={api}
          brandPrimary={brandPrimary}
        />
      );
    }

    return (
      <LearnerDashboard
        api={api}
        userId={user.id}
        attempts={attempts}
        onStartAttempt={startAttempt}
      />
    );
  };

  const AssessmentDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const [assessment, setAssessment] = useState<any>(null);
    const [assessmentAttempts, setAssessmentAttempts] = useState<any[]>([]);
    const [cohorts, setCohorts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (!id || !api || !user) return;
      const load = async () => {
        try {
          const a = await api.fetchAssessment(id);
          setAssessment(a);
          const cs = await api.fetchLearnerCohorts(user.id);
          setCohorts(cs);
          const allAttempts = attempts.filter(att => att.assessmentId === id);
          setAssessmentAttempts(allAttempts);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [id, api, attempts, user]);

    if (loading) {
      return <LoadingState label="Loading assessment..." />;
    }

    if (!assessment) {
      return <div>Assessment not found</div>;
    }

    const assignment = cohorts.flatMap(c => c.assignments || []).find((a: any) => a.assessmentId === id);
    const allowedAttempts = assignment?.allowedAttempts ?? assessment.allowedAttempts ?? 1;
    const inProgressAttempt = assessmentAttempts.find(a => a.status === 'in_progress');
    const canStartNew = assessmentAttempts.length < allowedAttempts && !inProgressAttempt;

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-brand-50 bg-white p-6">
          <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>
          <p className="mt-2 text-slate-600">{assessment.description}</p>
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Your Attempts</h2>
          {assessmentAttempts.length === 0 ? (
            <p className="text-slate-500">No attempts yet.</p>
          ) : (
            assessmentAttempts.map(attempt => (
              <div key={attempt.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Attempt #{attempt.id}</p>
                    <p className="text-xs text-slate-500">{new Date(attempt.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      attempt.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                      attempt.status === 'submitted' ? 'bg-sky-100 text-sky-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {attempt.status === 'in_progress' ? 'In Progress' :
                       attempt.status === 'submitted' ? 'Submitted' : 'Scored'}
                    </span>
                    {attempt.status === 'in_progress' && (
                      <button
                        onClick={() => setActiveAttemptId(attempt.id)}
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg"
                      >
                        Continue
                      </button>
                    )}
                    {(attempt.status === 'submitted' || attempt.status === 'scored') && (
                      <button
                        onClick={() => setViewingAttemptId(attempt.id)}
                        className="px-4 py-2 bg-slate-600 text-white rounded-lg"
                      >
                        View Results
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {canStartNew && (
            <button
              onClick={() => startAttempt(id)}
              className="w-full py-3 bg-brand-600 text-white rounded-lg font-semibold"
            >
              Start New Attempt
            </button>
          )}
        </div>
      </div>
    );
  };

  const AnalyticsPage = () => (
    <section className="rounded-2xl border border-brand-50 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
      <p className="mt-2 text-sm text-slate-600">Live dashboards are coming soon. In the meantime, use the My Assessments tab to fetch attempt-level metrics.</p>
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
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {visibleNavItems.map(item => {
            const isActive = item.id === activeNav || item.children?.some(c => c.id === activeNav);
            const isExpanded = expandedMenus.has(item.id);
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.children) {
                      setExpandedMenus(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(item.id)) {
                          newSet.delete(item.id);
                        } else {
                          newSet.add(item.id);
                        }
                        return newSet;
                      });
                    } else if (item.path) {
                      if (location.pathname !== item.path) {
                        navigate(item.path);
                      }
                      if (!sidebarPinned) {
                        setSidebarOpen(false);
                      }
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    isActive
                      ? 'border-brand-100 bg-brand-50 text-brand-700'
                      : 'border-transparent bg-white text-slate-500 hover:border-brand-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {item.label}
                    {item.children && (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )
                    )}
                  </span>
                  {isActive && !item.children && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                </button>
                {isExpanded && item.children && (
                  <div className="ml-4 space-y-2">
                    {item.children.map(child => {
                      const childActive = child.id === activeNav;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => {
                            if (child.path && location.pathname !== child.path) {
                              navigate(child.path);
                            }
                            if (!sidebarPinned) {
                              setSidebarOpen(false);
                            }
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                            childActive
                              ? 'border-brand-100 bg-brand-50 text-brand-700'
                              : 'border-transparent bg-white text-slate-500 hover:border-brand-100 hover:text-slate-900'
                          }`}
                        >
                          {child.label}
                          {childActive && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
              combinedLogout();
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

          {breadcrumbItems.length > 0 && (
            <Breadcrumb items={breadcrumbItems} />
          )}

          <Routes>
            <Route path="/" element={<Navigate to={LANDING_PATH} replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/my-assessments" element={<MyAssessmentsPage />} />
            <Route path="/my-assessments/completed" element={<CompletedAssessmentsPage />} />
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
            <Route
              path="/cohorts"
              element={(isContentAuthor || isTenantAdmin) ? <CohortsPage api={api} brandPrimary={brandPrimary} /> : <Navigate to={LANDING_PATH} replace />}
            />
            <Route
              path="/users"
              element={isTenantAdmin ? <UsersPage api={api} brandPrimary={brandPrimary} /> : <Navigate to={LANDING_PATH} replace />}
            />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/taxonomy-config" element={<TaxonomyConfigPage api={api} brandPrimary={brandPrimary} />} />
            <Route path="/assessment/:id" element={<AssessmentDetailPage />} />
            <Route path="/assessment/:id/result" element={<AssessmentResultPage api={api} brandPrimary={brandPrimary} />} />
            <Route path="*" element={<Navigate to={LANDING_PATH} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
