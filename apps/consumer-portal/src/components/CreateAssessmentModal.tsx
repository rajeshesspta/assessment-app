import { useState, useEffect } from 'react';
import { X, Search, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import type { Item, Assessment } from '../utils/api';

interface CreateAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assessment: any) => Promise<void>;
  initialAssessment?: Assessment | null;
  api: any;
  brandPrimary?: string;
}

export function CreateAssessmentModal({ isOpen, onClose, onSave, initialAssessment, api, brandPrimary }: CreateAssessmentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowedAttempts, setAllowedAttempts] = useState(1);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | undefined>(undefined);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadItems();
      if (initialAssessment) {
        setTitle(initialAssessment.title);
        setDescription(initialAssessment.description || '');
        setAllowedAttempts(initialAssessment.allowedAttempts);
        setTimeLimitMinutes(initialAssessment.timeLimitMinutes);
        setSelectedItemIds(initialAssessment.itemIds);
      } else {
        setTitle('');
        setDescription('');
        setAllowedAttempts(1);
        setTimeLimitMinutes(undefined);
        setSelectedItemIds([]);
      }
    }
  }, [isOpen, initialAssessment]);

  const loadItems = async () => {
    try {
      const items = await api.fetchItems();
      setAvailableItems(items);
    } catch (err) {
      console.error('Failed to load items', err);
    }
  };

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(selectedItemIds.filter(i => i !== id));
    } else {
      setSelectedItemIds([...selectedItemIds, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItemIds.length === 0) {
      setError('Please select at least one item.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      await onSave({
        title,
        description,
        allowedAttempts,
        timeLimitMinutes,
        itemIds: selectedItemIds,
      });
      onClose();
      // Reset form
      setTitle('');
      setDescription('');
      setAllowedAttempts(1);
      setTimeLimitMinutes(undefined);
      setSelectedItemIds([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = availableItems.filter(item => 
    item.prompt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">
            {initialAssessment ? 'Edit Assessment' : 'Create New Assessment'}
          </h3>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Assessment Title</label>
                  <input
                    required
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    placeholder="e.g., Mid-term Math Quiz"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Description (Optional)</label>
                  <textarea
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    placeholder="Provide context for learners..."
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <RotateCcw className="h-3 w-3" />
                      Allowed Attempts
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                      value={allowedAttempts}
                      onChange={e => setAllowedAttempts(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Time Limit (min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                      placeholder="No limit"
                      value={timeLimitMinutes || ''}
                      onChange={e => setTimeLimitMinutes(e.target.value ? parseInt(e.target.value) : undefined)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 flex flex-col overflow-hidden">
                <label className="text-sm font-semibold text-slate-700">Select Items ({selectedItemIds.length} selected)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                  {filteredItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition hover:bg-slate-50 ${selectedItemIds.includes(item.id) ? 'bg-brand-50/50' : ''}`}
                    >
                      <div className={`flex h-5 w-5 items-center justify-center rounded border ${selectedItemIds.includes(item.id) ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 bg-white'}`} style={selectedItemIds.includes(item.id) ? { backgroundColor: brandPrimary, borderColor: brandPrimary } : {}}>
                        {selectedItemIds.includes(item.id) && <CheckCircle2 className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.prompt}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{item.kind}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
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
              {isSubmitting ? 'Creating...' : 'Create Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
