import { useState, useEffect } from 'react';
import { X, Users, CheckCircle2 } from 'lucide-react';
import type { Assessment, Cohort } from '../utils/api';

interface ScheduleAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment | null;
  api: any;
  brandPrimary?: string;
}

export function ScheduleAssessmentModal({ isOpen, onClose, assessment, api, brandPrimary }: ScheduleAssessmentModalProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>([]);
  const [allowedAttempts, setAllowedAttempts] = useState(1);
  const [availableFrom, setAvailableFrom] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCohorts();
      if (assessment) {
        setAllowedAttempts(assessment.allowedAttempts || 1);
      }
    }
  }, [isOpen, assessment]);

  const loadCohorts = async () => {
    try {
      const data = await api.fetchCohorts();
      setCohorts(data);
      // Pre-select cohorts that already have this assessment
      if (assessment) {
        const alreadyScheduled = data
          .filter((c: Cohort) => c.assessmentIds.includes(assessment.id))
          .map((c: Cohort) => c.id);
        setSelectedCohortIds(alreadyScheduled);
      }
    } catch (err) {
      console.error('Failed to load cohorts', err);
    }
  };

  if (!isOpen || !assessment) return null;

  const toggleCohort = (id: string) => {
    if (selectedCohortIds.includes(id)) {
      setSelectedCohortIds(selectedCohortIds.filter(i => i !== id));
    } else {
      setSelectedCohortIds([...selectedCohortIds, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      for (const cohortId of selectedCohortIds) {
        await api.assignAssessmentToCohort(cohortId, assessment.id, { 
          allowedAttempts,
          availableFrom: availableFrom || undefined,
          dueDate: dueDate || undefined
        });
      }
      
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
          <h3 className="text-xl font-bold text-slate-900">Schedule Assessment</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <p className="text-sm text-slate-500">Schedule <span className="font-bold text-slate-900">"{assessment.title}"</span> for the following cohorts:</p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Allowed Attempts</span>
              <input
                type="number"
                min="1"
                max="100"
                value={allowedAttempts}
                onChange={(e) => setAllowedAttempts(parseInt(e.target.value))}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">Override the default attempt limit for these cohorts.</p>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Available From (Optional)</span>
              <input
                type="datetime-local"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">Set a start time for this assessment.</p>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Due Date (Optional)</span>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">Set a deadline for this assessment.</p>
            </label>

            <div>
              <span className="text-sm font-semibold text-slate-700">Select Cohorts</span>
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                {cohorts.length === 0 ? (
                  <p className="p-4 text-center text-sm text-slate-500">No cohorts found.</p>
                ) : (
                  cohorts.map(cohort => (
                <div
                  key={cohort.id}
                  onClick={() => toggleCohort(cohort.id)}
                  className={`flex items-center gap-3 p-3 cursor-pointer transition hover:bg-slate-50 ${selectedCohortIds.includes(cohort.id) ? 'bg-brand-50/50' : ''}`}
                >
                  <div className={`flex h-5 w-5 items-center justify-center rounded border ${selectedCohortIds.includes(cohort.id) ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 bg-white'}`} style={selectedCohortIds.includes(cohort.id) ? { backgroundColor: brandPrimary, borderColor: brandPrimary } : {}}>
                    {selectedCohortIds.includes(cohort.id) && <CheckCircle2 className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{cohort.name}</p>
                    <p className="text-xs text-slate-500">{cohort.learnerIds.length} learners</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

          <div className="flex items-center justify-end gap-3">
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
              {isSubmitting ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
