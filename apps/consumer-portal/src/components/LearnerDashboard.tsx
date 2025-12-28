import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, CheckCircle, AlertCircle, TrendingUp, FileText } from 'lucide-react';
import type { Cohort, Assessment, AttemptResponse } from '../utils/api';

interface LearnerDashboardProps {
  api: any;
  userId: string;
  attempts: AttemptResponse[];
  onStartAttempt: (assessmentId: string) => void;
}

export function LearnerDashboard({ api, userId, attempts, onStartAttempt }: LearnerDashboardProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [assessments, setAssessments] = useState<Record<string, Assessment>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const learnerCohorts = await api.fetchLearnerCohorts(userId);
        setCohorts(learnerCohorts);

        // Fetch all unique assessment details
        const assessmentIds = Array.from(new Set(
          learnerCohorts.flatMap(c => c.assignments?.map(a => a.assessmentId) || [])
        ));

        const details: Record<string, Assessment> = {};
        await Promise.all(assessmentIds.map(async (id) => {
          try {
            const a = await api.fetchAssessment(id);
            details[id] = a;
          } catch (e) {
            console.error(`Failed to fetch assessment ${id}`, e);
          }
        }));
        setAssessments(details);
      } catch (error) {
        console.error('Failed to load dashboard data', error);
      } finally {
        setLoading(false);
      }
    }

    if (userId && api) {
      loadData();
    }
  }, [api, userId]);

  const dashboardStats = useMemo(() => {
    if (loading) return null;

    const now = new Date();
    const allAssignments = cohorts.flatMap(c => c.assignments || []);
    const uniqueAssessmentIds = Array.from(new Set(allAssignments.map(a => a.assessmentId)));

    // Count completed attempts
    const completedAttempts = attempts.filter(a => a.completedAt).length;

    // Count available assessments (not expired, not started or within attempt limits)
    const availableAssessments = allAssignments.filter(assignment => {
      const assessment = assessments[assignment.assessmentId];
      if (!assessment) return false;

      const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
      if (dueDate && dueDate < now) return false; // Expired

      const userAttempts = attempts.filter(a => a.assessmentId === assignment.assessmentId);
      const maxAttempts = assessment.allowedAttempts || 1;
      return userAttempts.length < maxAttempts;
    }).length;

    // Count upcoming deadlines (next 7 days)
    const upcomingDeadlines = allAssignments.filter(assignment => {
      const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
      if (!dueDate) return false;
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilDue >= 0 && daysUntilDue <= 7;
    }).length;

    // Count completed assessments (where user has used all attempts or has completed attempts)
    const completedAssessments = allAssignments.filter(assignment => {
      const assessment = assessments[assignment.assessmentId];
      if (!assessment) return false;

      const userAttempts = attempts.filter(a => a.assessmentId === assignment.assessmentId);
      const maxAttempts = assessment.allowedAttempts || 1;
      return userAttempts.length >= maxAttempts && userAttempts.length > 0;
    }).length;

    // Get completed assessments details
    const completedAssessmentDetails = allAssignments.filter(assignment => {
      const assessment = assessments[assignment.assessmentId];
      if (!assessment) return false;

      const userAttempts = attempts.filter(a => a.assessmentId === assignment.assessmentId);
      const maxAttempts = assessment.allowedAttempts || 1;
      return userAttempts.length >= maxAttempts && userAttempts.length > 0;
    }).map(assignment => ({
      ...assignment,
      assessment: assessments[assignment.assessmentId],
      attempts: attempts.filter(a => a.assessmentId === assignment.assessmentId)
    }));

    return {
      totalAssigned: uniqueAssessmentIds.length,
      availableAssessments,
      completedAttempts,
      upcomingDeadlines,
      recentAttempts,
      completedAssessments,
      completedAssessmentDetails,
    };
  }, [cohorts, assessments, attempts, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"></div>
          <p className="mt-2 text-sm text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboardStats) return null;

  const stats = [
    {
      title: 'Assigned Assessments',
      value: dashboardStats.totalAssigned,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Available to Start',
      value: dashboardStats.availableAssessments,
      icon: Play,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Completed Attempts',
      value: dashboardStats.completedAttempts,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Upcoming Deadlines',
      value: dashboardStats.upcomingDeadlines,
      icon: AlertCircle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <article key={stat.title} className="rounded-2xl border border-brand-50 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-600">{stat.title}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Recent Activity */}
      <section className="rounded-2xl border border-brand-50 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        {dashboardStats.recentAttempts > 0 ? (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            <span>
              {dashboardStats.recentAttempts} attempt{dashboardStats.recentAttempts !== 1 ? 's' : ''} started in the last 7 days
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Clock className="h-5 w-5 text-slate-400" />
            <span>No recent activity. Ready to start an assessment?</span>
          </div>
        )}
      </section>

      {/* Quick Actions / Assigned Assessments Preview */}
      <section className="rounded-2xl border border-brand-50 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Assigned Assessments</h2>
        {dashboardStats.availableAssessments > 0 ? (
          <p className="text-sm text-slate-600 mb-4">
            You have {dashboardStats.availableAssessments} assessment{dashboardStats.availableAssessments !== 1 ? 's' : ''} available to start.
          </p>
        ) : (
          <p className="text-sm text-slate-600 mb-4">
            All assigned assessments have been completed or are no longer available.
          </p>
        )}
        <button
          type="button"
          onClick={() => window.location.href = '/my-assessments'}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          View All Assessments
        </button>
      </section>

      {/* Completed Assessments */}
      {dashboardStats.completedAssessments > 0 && (
        <section className="rounded-2xl border border-brand-50 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Completed Assessments</h2>
          <p className="text-sm text-slate-600 mb-4">
            You have completed {dashboardStats.completedAssessments} assessment{dashboardStats.completedAssessments !== 1 ? 's' : ''}.
          </p>
          <div className="space-y-3">
            {dashboardStats.completedAssessmentDetails.map((item, index) => (
              <div key={`${item.assessmentId}-${index}`} className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-medium text-slate-900">{item.assessment?.title || `Assessment ${item.assessmentId}`}</p>
                    <p className="text-sm text-slate-500">
                      {item.attempts.length} attempt{item.attempts.length !== 1 ? 's' : ''} completed
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => window.location.href = `/assessment/${item.assessmentId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  View Results
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}