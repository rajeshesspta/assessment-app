import { useEffect, useState } from 'react';
import { Plus, Search, FileText, Clock, RotateCcw, Users } from 'lucide-react';
import type { Assessment } from '../utils/api';
import { LoadingState } from './LoadingState';
import { CreateAssessmentModal } from './CreateAssessmentModal';
import { ScheduleAssessmentModal } from './ScheduleAssessmentModal';

interface AssessmentsPageProps {
  api: any;
  brandPrimary?: string;
  brandLabelStyle?: React.CSSProperties;
}

export function AssessmentsPage({ api, brandPrimary, brandLabelStyle }: AssessmentsPageProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);

  const loadAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchAssessments();
      setAssessments(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [api]);

  const handleSaveAssessment = async (assessmentData: any) => {
    if (selectedAssessment) {
      await api.updateAssessment(selectedAssessment.id, assessmentData);
    } else {
      await api.createAssessment(assessmentData);
    }
    await loadAssessments();
  };

  const filteredAssessments = assessments.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase()) || 
    a.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <LoadingState label="Loading assessments..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Assessments</h2>
          <p className="text-sm text-slate-500">Create and manage assessments for your cohorts.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedAssessment(null);
            setIsCreateModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          style={{ backgroundColor: brandPrimary }}
        >
          <Plus className="h-4 w-4" />
          Create Assessment
        </button>
      </div>

      <CreateAssessmentModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setSelectedAssessment(null);
        }}
        onSave={handleSaveAssessment}
        initialAssessment={selectedAssessment}
        api={api}
        brandPrimary={brandPrimary}
      />

      <ScheduleAssessmentModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setSelectedAssessment(null);
        }}
        assessment={selectedAssessment}
        api={api}
        brandPrimary={brandPrimary}
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-brand-50 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search assessments..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-semibold">Failed to load assessments</p>
          <p className="text-xs">{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {filteredAssessments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 py-12 text-center">
            <div className="rounded-full bg-slate-50 p-4 text-slate-400">
              <FileText className="h-8 w-8" />
            </div>
            <p className="mt-4 font-semibold text-slate-900">No assessments found</p>
            <p className="text-sm text-slate-500">Create your first assessment to get started.</p>
          </div>
        ) : (
          filteredAssessments.map(assessment => (
            <div
              key={assessment.id}
              className="group flex items-center justify-between rounded-2xl border border-brand-50 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600" style={{ backgroundColor: `${brandPrimary}15`, color: brandPrimary }}>
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{assessment.title}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{assessment.timeLimitMinutes ? `${assessment.timeLimitMinutes}m` : 'No limit'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <RotateCcw className="h-3 w-3" />
                      <span>{assessment.allowedAttempts} attempts</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{assessment.itemIds.length} items</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssessment(assessment);
                    setIsCreateModalOpen(true);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssessment(assessment);
                    setIsScheduleModalOpen(true);
                  }}
                  className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Schedule
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
