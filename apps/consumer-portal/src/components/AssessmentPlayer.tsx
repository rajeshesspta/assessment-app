import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Save, Send } from 'lucide-react';
import type { Assessment, AttemptResponse, Item, ItemKind } from '../utils/api';
import { LoadingState } from './LoadingState';

function hashStringToUint32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(input: readonly T[], seed: string): T[] {
  const rng = mulberry32(hashStringToUint32(seed));
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface AssessmentPlayerProps {
  attemptId: string;
  api: any;
  brandPrimary?: string;
  onComplete: (attempt: AttemptResponse) => void;
  onExit: () => void;
}

export function AssessmentPlayer({ attemptId, api, brandPrimary = '#f97316', onComplete, onExit }: AssessmentPlayerProps) {
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const attemptData = await api.fetchAttempt(attemptId);
        setAttempt(attemptData);

        const assessmentData = await api.fetchAssessment(attemptData.assessmentId);
        setAssessment(assessmentData);

        // Use items returned with the attempt (sanitized for learners)
        if (attemptData.items && attemptData.items.length > 0) {
          setItems(attemptData.items);
        } else {
          // Fallback for older attempts or if items weren't included
          const allItems = await api.fetchItems({ limit: 1000 });
          const assessmentItems = assessmentData.itemIds
            .map((id: string) => allItems.find((item: Item) => item.id === id))
            .filter(Boolean) as Item[];
          setItems(assessmentItems);
        }

        // Initialize responses from attempt
        const initialResponses: Record<string, any> = {};
        (attemptData.responses || []).forEach((r: any) => {
          initialResponses[r.itemId] = r;
        });
        setResponses(initialResponses);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [attemptId, api]);

  const currentItem = items[currentIndex];

  const handleResponseChange = (itemId: string, update: any) => {
    setResponses(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        itemId,
        ...update,
      },
    }));
  };

  const saveProgress = async () => {
    if (!attempt) return;
    setSaving(true);
    try {
      await api.saveAttemptResponses(attempt.id, Object.values(responses));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!attempt) return;
    if (!window.confirm('Are you sure you want to submit your assessment? You won\'t be able to change your answers.')) {
      return;
    }
    setSubmitting(true);
    try {
      await saveProgress();
      // Re-fetch the attempt to ensure it's still in progress
      const currentAttempt = await api.fetchAttempt(attempt.id);
      if (currentAttempt.status !== 'in_progress') {
        throw new Error('Attempt has already been submitted');
      }
      const finalAttempt = await api.submitAttempt(attempt.id);
      onComplete(finalAttempt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingState label="Loading assessment..." /></div>;
  if (error) return <div className="p-8 text-rose-600">Error: {error}</div>;
  if (!assessment || items.length === 0) return <div className="p-8">No assessment data found.</div>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{assessment.title}</h1>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Item {currentIndex + 1} of {items.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {assessment.timeLimitMinutes && (
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="h-5 w-5" />
              <span className="font-mono font-bold">--:--</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={saveProgress}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Progress'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: brandPrimary }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <div className="mb-8">
              <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 uppercase tracking-wider">
                {currentItem.kind.replace(/_/g, ' ')}
              </span>
              <h2 className="mt-4 text-xl font-medium text-slate-900 leading-relaxed">
                {currentItem.prompt}
              </h2>
            </div>

            <div className="space-y-6">
              <ItemInput
                item={currentItem}
                response={responses[currentItem.id] || {}}
                brandPrimary={brandPrimary}
                onChange={(update) => handleResponseChange(currentItem.id, update)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="border-t bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
            Previous
          </button>

          <div className="flex gap-2">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  idx === currentIndex
                    ? 'bg-brand-600 w-6'
                    : responses[items[idx].id]
                    ? 'bg-brand-200'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {currentIndex === items.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
              {submitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          ) : (
            <button
              onClick={() => setCurrentIndex(prev => Math.min(items.length - 1, prev + 1))}
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Next
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function ItemInput({ item, response, brandPrimary, onChange }: { item: Item; response: any; brandPrimary: string; onChange: (update: any) => void }) {
  switch (item.kind) {
    case 'MCQ':
    case 'TRUE_FALSE': {
      const options = item.kind === 'MCQ' ? item.choices || [] : [{ text: 'True' }, { text: 'False' }];
      const isMultiple = item.answerMode === 'multiple';
      const currentAnswers = response.answerIndexes || [];

      return (
        <div className="space-y-3">
          {options.map((opt, idx) => {
            const isSelected = currentAnswers.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => {
                  if (isMultiple) {
                    const next = isSelected
                      ? currentAnswers.filter((i: number) => i !== idx)
                      : [...currentAnswers, idx];
                    onChange({ answerIndexes: next });
                  } else {
                    onChange({ answerIndexes: [idx] });
                  }
                }}
                className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-slate-200 hover:border-brand-200 hover:bg-slate-50'
                }`}
              >
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 transition ${
                  isMultiple ? 'rounded-md' : 'rounded-full'
                } ${isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300'}`}>
                  {isSelected && (
                    <div className={isMultiple ? 'h-3 w-3 bg-white rounded-sm' : 'h-2.5 w-2.5 bg-white rounded-full'} />
                  )}
                </div>
                <span className={`text-base ${isSelected ? 'font-semibold text-brand-900' : 'text-slate-700'}`}>
                  {opt.text}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    case 'FILL_IN_THE_BLANK': {
      const blanks = item.blanks || [];
      const currentAnswers = response.textAnswers || [];

      return (
        <div className="space-y-4">
          {blanks.map((blank, idx) => (
            <div key={blank.id} className="flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-500 w-24">Blank {idx + 1}:</span>
              <input
                type="text"
                value={currentAnswers[idx] || ''}
                onChange={(e) => {
                  const next = [...currentAnswers];
                  next[idx] = e.target.value;
                  onChange({ textAnswers: next });
                }}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 focus:border-brand-500 focus:ring-brand-500"
                placeholder="Type your answer..."
              />
            </div>
          ))}
        </div>
      );
    }

    case 'MATCHING': {
      const prompts = item.prompts || [];
      const targets = item.targets || [];
      const currentMatches = response.matchingAnswers || [];
      const shuffledTargets = seededShuffle(targets, `attempt:${attemptId}:item:${item.id}:matching-targets`);

      return (
        <div className="space-y-6">
          {prompts.map((prompt) => {
            const match = currentMatches.find((m: any) => m.promptId === prompt.id);
            return (
              <div key={prompt.id} className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-slate-700">{prompt.text}</p>
                <select
                  value={match?.targetId || ''}
                  onChange={(e) => {
                    const next = currentMatches.filter((m: any) => m.promptId !== prompt.id);
                    if (e.target.value) {
                      next.push({ promptId: prompt.id, targetId: e.target.value });
                    }
                    onChange({ matchingAnswers: next });
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 focus:border-brand-500 focus:ring-brand-500"
                >
                  <option value="">Select a match...</option>
                  {shuffledTargets.map((target) => (
                    <option key={target.id} value={target.id}>{target.text}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      );
    }

    case 'ORDERING': {
      const options = item.options || [];
      const currentOrder = response.orderingAnswer || [];

      // If no order yet, show options in original order
      const displayOptions = currentOrder.length === options.length
        ? currentOrder.map((id: string) => options.find(o => o.id === id)).filter(Boolean)
        : options;

      return (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 italic mb-4">Use buttons to reorder</p>
          {displayOptions.map((opt: any, idx: number) => (
            <div key={opt.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 bg-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
                {idx + 1}
              </span>
              <span className="flex-1 text-slate-700">{opt.text}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const next = [...displayOptions];
                    if (idx > 0) {
                      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                      onChange({ orderingAnswer: next.map((o: any) => o.id) });
                    }
                  }}
                  disabled={idx === 0}
                  className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-20"
                >
                  ↑
                </button>
                <button
                  onClick={() => {
                    const next = [...displayOptions];
                    if (idx < displayOptions.length - 1) {
                      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                      onChange({ orderingAnswer: next.map((o: any) => o.id) });
                    }
                  }}
                  disabled={idx === displayOptions.length - 1}
                  className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-20"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    case 'SHORT_ANSWER':
    case 'ESSAY': {
      return (
        <textarea
          value={response.essayAnswer || response.textAnswers?.[0] || ''}
          onChange={(e) => {
            if (item.kind === 'ESSAY') {
              onChange({ essayAnswer: e.target.value });
            } else {
              onChange({ textAnswers: [e.target.value] });
            }
          }}
          rows={item.kind === 'ESSAY' ? 12 : 4}
          className="w-full rounded-xl border border-slate-200 p-4 focus:border-brand-500 focus:ring-brand-500"
          placeholder="Type your response here..."
        />
      );
    }

    case 'NUMERIC_ENTRY': {
      return (
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={response.numericAnswer?.value ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
              onChange({ numericAnswer: { value: v, unit: item.units?.symbol ?? item.units?.label } });
            }}
            className="w-48 rounded-lg border border-slate-200 px-4 py-2 focus:border-brand-500 focus:ring-brand-500"
            placeholder="0.00"
          />
          {item.units && <span className="text-slate-600 font-medium">{item.units.symbol ?? item.units.label}</span>}
        </div>
      );
    }

    case 'HOTSPOT': {
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Click on the image to mark your answers.</p>
          <div className="relative inline-block rounded-xl overflow-hidden border border-slate-200">
            <img
              src={item.imageUri || 'https://placehold.co/600x400?text=Hotspot+Image'}
              alt="Hotspot"
              className="max-w-full cursor-crosshair"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                const current = response.hotspotAnswers || [];
                onChange({ hotspotAnswers: [...current, { x, y }] });
              }}
            />
            {(response.hotspotAnswers || []).map((point: any, idx: number) => (
              <div
                key={idx}
                className="absolute h-4 w-4 -ml-2 -mt-2 rounded-full bg-brand-500 border-2 border-white shadow-lg"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = response.hotspotAnswers.filter((_: any, i: number) => i !== idx);
                  onChange({ hotspotAnswers: next });
                }}
              />
            ))}
          </div>
          <button
            onClick={() => onChange({ hotspotAnswers: [] })}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700"
          >
            Clear all marks
          </button>
        </div>
      );
    }

    case 'DRAG_AND_DROP': {
      const tokens = item.tokens || [];
      const zones = item.zones || [];
      const placements = response.dragDropAnswers || [];

      return (
        <div className="space-y-8">
          <div className="flex flex-wrap gap-3 p-4 bg-slate-100 rounded-xl border border-dashed border-slate-300">
            {tokens.map(token => {
              const isPlaced = placements.some((p: any) => p.tokenId === token.id);
              if (isPlaced) return null;
              return (
                <div
                  key={token.id}
                  className="px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:border-brand-500"
                  onClick={() => {
                    // Simple simulation: place in first empty zone
                    const firstZone = zones[0];
                    if (firstZone) {
                      onChange({ dragDropAnswers: [...placements, { tokenId: token.id, dropZoneId: firstZone.id }] });
                    }
                  }}
                >
                  {token.text}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {zones.map(zone => (
              <div key={zone.id} className="p-4 border-2 border-dashed border-slate-200 rounded-xl min-h-[100px]">
                <p className="text-xs font-bold text-slate-400 uppercase mb-3">{zone.label}</p>
                <div className="flex flex-wrap gap-2">
                  {placements
                    .filter((p: any) => p.dropZoneId === zone.id)
                    .map((p: any) => {
                      const token = tokens.find(t => t.id === p.tokenId);
                      return (
                        <div
                          key={p.tokenId}
                          className="px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg border border-brand-200 flex items-center gap-2"
                        >
                          {token?.text}
                          <button
                            onClick={() => onChange({ dragDropAnswers: placements.filter((x: any) => x.tokenId !== p.tokenId) })}
                            className="text-brand-400 hover:text-brand-600"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'SCENARIO_TASK': {
      const scenario = response.scenarioAnswer || {};
      return (
        <div className="space-y-6">
          <div className="rounded-xl bg-slate-50 p-6 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 uppercase mb-4">Scenario Workspace</h4>
            <p className="text-sm text-slate-600 mb-4">
              Please complete the task in the provided environment and submit your repository or artifact URL below.
            </p>
            {item.workspaceTemplate && (
              <div className="mb-6 p-4 bg-slate-900 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
                {item.workspaceTemplate}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Repository URL</label>
              <input
                type="url"
                value={scenario.repositoryUrl || ''}
                onChange={(e) => onChange({ scenarioAnswer: { ...scenario, repositoryUrl: e.target.value } })}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-brand-500 focus:ring-brand-500"
                placeholder="https://github.com/your-username/your-repo"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Artifact URL (Optional)</label>
              <input
                type="url"
                value={scenario.artifactUrl || ''}
                onChange={(e) => onChange({ scenarioAnswer: { ...scenario, artifactUrl: e.target.value } })}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-brand-500 focus:ring-brand-500"
                placeholder="https://your-demo-site.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Submission Notes</label>
              <textarea
                value={scenario.submissionNotes || ''}
                onChange={(e) => onChange({ scenarioAnswer: { ...scenario, submissionNotes: e.target.value } })}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-brand-500 focus:ring-brand-500"
                placeholder="Any additional information for the reviewer..."
              />
            </div>
          </div>
        </div>
      );
    }

    default:
      return <div className="p-4 bg-amber-50 text-amber-700 rounded-lg">Input for {item.kind} is not yet implemented in this player.</div>;
  }
}
