import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Play } from 'lucide-react';
import type { Cohort, Assessment, AttemptResponse } from '../utils/api';

interface AssignedAssessmentsListProps {
  api: any;
  userId: string;
  onStartAttempt: (assessmentId: string) => void;
  onContinue: (attemptId: string) => void;
  attempts: AttemptResponse[];
}

export function AssignedAssessmentsList({ api, userId, onStartAttempt, onContinue, attempts }: AssignedAssessmentsListProps) {
  const navigate = useNavigate();
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
        console.error('Failed to load assigned assessments', error);
      } finally {
        setLoading(false);
      }
    }

    if (userId && api) {
      loadData();
    }
  }, [api, userId]);

  if (loading) {
    return <div className="animate-pulse text-sm text-slate-500">Loading assigned assessments...</div>;
  }

  const allAssignments = cohorts.flatMap(cohort => 
    (cohort.assignments || []).map(assignment => ({
      ...assignment,
      cohortName: cohort.name
    }))
  );

  if (allAssignments.length === 0) {
    return null;
  }

  // Separate assignments into available and completed
  const availableAssignments = allAssignments.filter(assignment => {
    const assessment = assessments[assignment.assessmentId];
    if (!assessment) return false;

    const now = new Date();
    const availableFrom = assignment.availableFrom ? new Date(assignment.availableFrom) : null;
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    
    const isNotYetAvailable = availableFrom && now < availableFrom;
    const isExpired = dueDate && now > dueDate;
    if (isNotYetAvailable || isExpired) return false;

    const userAttempts = attempts.filter(a => a.assessmentId === assessment.id);
    const allowedAttempts = assignment.allowedAttempts ?? assessment.allowedAttempts;
    const attemptsRemaining = Math.max(0, allowedAttempts - userAttempts.length);
    const isOutOfAttempts = attemptsRemaining <= 0;
    const inProgressAttempt = userAttempts.find(a => a.status === 'in_progress');

    // Available if not out of attempts or has in-progress attempt
    return !isOutOfAttempts || inProgressAttempt;
  });

  const completedAssignments = allAssignments.filter(assignment => {
    const assessment = assessments[assignment.assessmentId];
    if (!assessment) return false;

    const now = new Date();
    const availableFrom = assignment.availableFrom ? new Date(assignment.availableFrom) : null;
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    
    const isNotYetAvailable = availableFrom && now < availableFrom;
    const isExpired = dueDate && now > dueDate;
    if (isNotYetAvailable || isExpired) return false;

    const userAttempts = attempts.filter(a => a.assessmentId === assessment.id);
    const allowedAttempts = assignment.allowedAttempts ?? assessment.allowedAttempts;
    const attemptsRemaining = Math.max(0, allowedAttempts - userAttempts.length);
    const isOutOfAttempts = attemptsRemaining <= 0;
    const inProgressAttempt = userAttempts.find(a => a.status === 'in_progress');

    // Completed if out of attempts and no in-progress attempt
    return isOutOfAttempts && !inProgressAttempt && userAttempts.length > 0;
  });

  const renderAssessmentCard = (assignment: any, index: number) => {
    const assessment = assessments[assignment.assessmentId];
    if (!assessment) return null;

    const now = new Date();
    const availableFrom = assignment.availableFrom ? new Date(assignment.availableFrom) : null;
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    
    const isNotYetAvailable = availableFrom && now < availableFrom;
    const isExpired = dueDate && now > dueDate;
    const isDisabled = isNotYetAvailable || isExpired;

    const userAttempts = attempts.filter(a => a.assessmentId === assessment.id);
    const allowedAttempts = assignment.allowedAttempts ?? assessment.allowedAttempts;
    const attemptsRemaining = Math.max(0, allowedAttempts - userAttempts.length);
    const isOutOfAttempts = attemptsRemaining <= 0;
    const inProgressAttempt = userAttempts.find(a => a.status === 'in_progress');

    return (
      <div key={`${assignment.assessmentId}-${index}`} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md">
        <div className="mb-4 flex-1">
          <div className="flex items-start justify-between">
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              {assignment.cohortName}
            </span>
            {isExpired && (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                Expired
              </span>
            )}
            {isNotYetAvailable && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Scheduled
              </span>
            )}
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-900">{assessment.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{assessment.description}</p>
        </div>

        <div className="space-y-2 border-t border-slate-50 pt-4">
          {availableFrom && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              <span>Available: {availableFrom.toLocaleString()}</span>
            </div>
          )}
          {dueDate && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <span>Due: {dueDate.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-medium text-slate-600">
              Attempts: {userAttempts.length} / {allowedAttempts}
            </span>
            <button
              onClick={() => isOutOfAttempts && !inProgressAttempt ? navigate(`/assessment/${assessment.id}`) : navigate(`/assessment/${assessment.id}`)}
              disabled={isDisabled}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {inProgressAttempt ? 'Continue' : isNotYetAvailable ? 'Not Available' : isOutOfAttempts ? 'View Results' : 'Start'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Available Assessments */}
      {availableAssignments.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Available Assessments</h2>
          <p className="text-sm text-slate-600">Assessments you can start or continue working on.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableAssignments.map((assignment, index) => renderAssessmentCard(assignment, index))}
          </div>
        </section>
      )}

      {/* Completed Assessments */}
      {completedAssignments.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Completed Assessments</h2>
          <p className="text-sm text-slate-600">Assessments where you've used all your attempts. You can review your results.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completedAssignments.map((assignment, index) => renderAssessmentCard(assignment, index))}
          </div>
        </section>
      )}
    </div>
  );
}
