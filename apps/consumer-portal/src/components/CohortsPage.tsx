import { useEffect, useState } from 'react';
import { Search, Users, UserPlus, Plus, X, Edit2, Trash2, User, Mail, FileText } from 'lucide-react';
import type { Cohort, User as UserType } from '../utils/api';
import { LoadingState } from './LoadingState';

interface CohortsPageProps {
  api: any;
  brandPrimary?: string;
}

export function CohortsPage({ api, brandPrimary }: CohortsPageProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cohortData, userData] = await Promise.all([
        api.fetchCohorts(),
        api.fetchUsers()
      ]);
      setCohorts(cohortData);
      setUsers(userData.filter((u: UserType) => u.roles.includes('LEARNER')));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [api]);

  const filteredCohorts = cohorts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <LoadingState label="Loading cohorts..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cohorts</h2>
          <p className="text-sm text-slate-500">Manage groups of learners and their shared assignments.</p>
        </div>
        <button
          onClick={() => {
            setEditingCohort(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600"
          style={{ backgroundColor: brandPrimary }}
        >
          <Plus className="h-4 w-4" />
          Create Cohort
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-brand-50 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search cohorts..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-semibold">Error</p>
          <p className="text-xs">{error}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredCohorts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            No cohorts found.
          </div>
        ) : (
          filteredCohorts.map((cohort) => (
            <div key={cohort.id} className="group relative flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition hover:border-brand-200 hover:shadow-md">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600" style={{ backgroundColor: `${brandPrimary}15`, color: brandPrimary }}>
                  <Users className="h-6 w-6" />
                </div>
                <button
                  onClick={() => {
                    setEditingCohort(cohort);
                    setIsModalOpen(true);
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{cohort.name}</h3>
              <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                {cohort.learnerIds.length} learners · {cohort.assessmentIds.length} assessments
              </p>
              
              <div className="mt-6 flex items-center gap-2">
                <div className="flex -space-x-2 overflow-hidden">
                  {cohort.learnerIds.slice(0, 5).map((id) => {
                    const user = users.find(u => u.id === id);
                    return (
                      <div key={id} className="inline-block h-8 w-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600" title={user?.name || id}>
                        {user?.name?.[0] || '?'}
                      </div>
                    );
                  })}
                  {cohort.learnerIds.length > 5 && (
                    <div className="inline-block h-8 w-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                      +{cohort.learnerIds.length - 5}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <CohortModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCohort(null);
          }}
          cohort={editingCohort}
          users={users}
          api={api}
          onSaved={loadData}
          brandPrimary={brandPrimary}
        />
      )}
    </div>
  );
}

interface CohortModalProps {
  isOpen: boolean;
  onClose: () => void;
  cohort: Cohort | null;
  users: UserType[];
  api: any;
  onSaved: () => void;
  brandPrimary?: string;
}

function CohortModal({ isOpen, onClose, cohort, users, api, onSaved, brandPrimary }: CohortModalProps) {
  const [name, setName] = useState(cohort?.name || '');
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<string[]>(cohort?.learnerIds || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const toggleUser = (id: string) => {
    if (selectedLearnerIds.includes(id)) {
      setSelectedLearnerIds(selectedLearnerIds.filter(i => i !== id));
    } else {
      setSelectedLearnerIds([...selectedLearnerIds, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Cohort name is required.');
      return;
    }
    if (selectedLearnerIds.length === 0) {
      setError('Please select at least one learner.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (cohort) {
        await api.updateCohort(cohort.id, { name, learnerIds: selectedLearnerIds });
      } else {
        await api.createCohort({ name, learnerIds: selectedLearnerIds });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">{cohort ? 'Edit Cohort' : 'Create Cohort'}</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Cohort Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Class of 2024, Engineering Team"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Select Learners ({selectedLearnerIds.length})</label>
                <div className="relative w-48">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs focus:border-brand-500 focus:outline-none"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2 max-h-64 overflow-y-auto rounded-xl border border-slate-100 p-2">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left transition ${
                      selectedLearnerIds.includes(user.id)
                        ? 'bg-brand-50 border border-brand-100'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    {selectedLearnerIds.includes(user.id) && (
                      <div className="h-5 w-5 rounded-full bg-brand-500 flex items-center justify-center text-white" style={{ backgroundColor: brandPrimary }}>
                        <Plus className="h-3 w-3 rotate-45" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end gap-3">
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
              {isSubmitting ? 'Saving...' : cohort ? 'Update Cohort' : 'Create Cohort'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
