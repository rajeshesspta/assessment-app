import { useEffect, useState } from 'react';
import { Search, User, Plus, X } from 'lucide-react';
import type { User as UserType } from '../utils/api';

interface CreateCohortModalProps {
  isOpen: boolean;
  onClose: () => void;
  api: any;
  onCohortCreated: () => void;
  brandPrimary?: string;
}

export function CreateCohortModal({ isOpen, onClose, api, onCohortCreated, brandPrimary }: CreateCohortModalProps) {
  const [name, setName] = useState('');
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserType[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      const userData = await api.fetchUsers();
      setUsers(userData.filter((u: UserType) => u.roles.includes('LEARNER')));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.displayName?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
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
      await api.createCohort({ name, learnerIds: selectedLearnerIds });
      onCohortCreated();
      onClose();
      // Reset form
      setName('');
      setSelectedLearnerIds([]);
      setUserSearch('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">Create Cohort</h3>
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
                        <p className="text-sm font-semibold text-slate-900">{user.displayName || 'Unknown User'}</p>
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
              {isSubmitting ? 'Creating...' : 'Create Cohort'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}