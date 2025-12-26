import { useEffect, useState } from 'react';
import { Search, User, Mail, Shield, UserPlus, FileText, ExternalLink, CheckCircle2, Clock, AlertCircle, X } from 'lucide-react';
import type { User as UserType, Assessment, Cohort, AttemptResponse } from '../utils/api';
import { LoadingState } from './LoadingState';

interface LearnersPageProps {
  api: any;
  brandPrimary?: string;
}

export function LearnersPage({ api, brandPrimary }: LearnersPageProps) {
  const [users, setUsers] = useState<UserType[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userData, assessmentData] = await Promise.all([
        api.fetchUsers(),
        api.fetchAssessments()
      ]);
      setUsers(userData);
      setAssessments(assessmentData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [api]);

  const learners = users.filter(u => 
    u.roles.includes('LEARNER') && 
    (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return <LoadingState label="Loading learners..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Learners</h2>
          <p className="text-sm text-slate-500">Manage individual participants and their specific assignments.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-brand-50 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-semibold">Failed to load learners</p>
          <p className="text-xs">{error}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Learner</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Roles</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {learners.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  No learners found.
                </td>
              </tr>
            ) : (
              learners.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600" style={{ backgroundColor: `${brandPrimary}15`, color: brandPrimary }}>
                        <User className="h-4 w-4" />
                      </div>
                      <div className="font-medium text-slate-900">{user.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3 text-slate-400" />
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span key={role} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => {
                          setSelectedUser(user);
                          setIsDetailsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Details
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedUser(user);
                          setIsAssignModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        <UserPlus className="h-3 w-3" />
                        Assign
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAssignModalOpen && selectedUser && (
        <AssignIndividualModal
          isOpen={isAssignModalOpen}
          onClose={() => {
            setIsAssignModalOpen(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          assessments={assessments}
          api={api}
          brandPrimary={brandPrimary}
        />
      )}

      {isDetailsModalOpen && selectedUser && (
        <LearnerDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          assessments={assessments}
          api={api}
          brandPrimary={brandPrimary}
        />
      )}
    </div>
  );
}

interface LearnerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  assessments: Assessment[];
  api: any;
  brandPrimary?: string;
}

function LearnerDetailsModal({ isOpen, onClose, user, assessments, api, brandPrimary }: LearnerDetailsModalProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [attempts, setAttempts] = useState<AttemptResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        const [cohortData, attemptData] = await Promise.all([
          api.fetchLearnerCohorts(user.id),
          api.fetchUserAttempts(user.id)
        ]);
        setCohorts(cohortData);
        setAttempts(attemptData);
      } catch (err) {
        console.error('Failed to load learner details', err);
      } finally {
        setLoading(false);
      }
    };
    loadDetails();
  }, [user.id, api]);

  const getAssessmentTitle = (id: string) => assessments.find(a => a.id === id)?.title ?? id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600" style={{ backgroundColor: `${brandPrimary}15`, color: brandPrimary }}>
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{user.name}</h3>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600 mb-4" style={{ borderTopColor: brandPrimary }}></div>
              <p>Loading details...</p>
            </div>
          ) : (
            <>
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  Active Assignments
                </h4>
                <div className="grid gap-3">
                  {cohorts.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No active assignments.</p>
                  ) : (
                    cohorts.flatMap(c => (c.assignments ?? []).map(a => ({ ...a, cohortName: c.name }))).map((assignment, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div>
                          <p className="font-semibold text-slate-900">{getAssessmentTitle(assignment.assessmentId)}</p>
                          <p className="text-xs text-slate-500">via {assignment.cohortName}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-700">{assignment.allowedAttempts ?? 1} attempts</p>
                            <p className="text-[10px] text-slate-500 uppercase">Limit</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400" />
                  Recent Attempts
                </h4>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Assessment</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Score</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attempts.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500 italic">
                            No attempts recorded.
                          </td>
                        </tr>
                      ) : (
                        attempts.map((attempt) => (
                          <tr key={attempt.id} className="text-sm">
                            <td className="px-4 py-3 font-medium text-slate-900">{getAssessmentTitle(attempt.assessmentId)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                attempt.status === 'scored' ? 'bg-emerald-50 text-emerald-700' :
                                attempt.status === 'submitted' ? 'bg-amber-50 text-amber-700' :
                                'bg-blue-50 text-blue-700'
                              }`}>
                                {attempt.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {attempt.score !== undefined ? (
                                <span className="font-bold text-slate-900">{attempt.score}/{attempt.maxScore}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {new Date(attempt.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-white border border-slate-200 px-6 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface AssignIndividualModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  assessments: Assessment[];
  api: any;
  brandPrimary?: string;
}

function AssignIndividualModal({ isOpen, onClose, user, assessments, api, brandPrimary }: AssignIndividualModalProps) {
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [allowedAttempts, setAllowedAttempts] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessmentId) {
      setError('Please select an assessment.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.assignToUser(user.id, {
        assessmentId: selectedAssessmentId,
        allowedAttempts: Number(allowedAttempts)
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">Assign Assessment</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Learner</label>
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Select Assessment</label>
            <select
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
              value={selectedAssessmentId}
              onChange={e => setSelectedAssessmentId(e.target.value)}
            >
              <option value="">Choose an assessment...</option>
              {assessments.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Allowed Attempts</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
              value={allowedAttempts}
              onChange={e => setAllowedAttempts(parseInt(e.target.value))}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-brand-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600 disabled:opacity-50"
              style={{ backgroundColor: brandPrimary }}
            >
              {isSubmitting ? 'Assigning...' : 'Assign Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
