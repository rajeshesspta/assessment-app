import { X } from 'lucide-react';
import type { Item } from '../utils/api';

interface ItemPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item | null;
  brandPrimary?: string;
}

export function ItemPreview({ isOpen, onClose, item, brandPrimary }: ItemPreviewProps) {
  if (!isOpen || !item) return null;

  const renderContent = () => {
    switch (item.kind) {
      case 'MCQ':
        return (
          <div className="space-y-3">
            {item.choices?.map((choice, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <div className={`h-5 w-5 rounded-full border-2 ${item.answerMode === 'multiple' ? 'rounded-md' : ''}`} />
                <span className="text-sm text-slate-700">{choice.text}</span>
              </div>
            ))}
          </div>
        );
      case 'TRUE_FALSE':
        return (
          <div className="flex gap-4">
            {['True', 'False'].map((label) => (
              <div key={label} className="flex-1 rounded-xl border border-slate-200 p-3 text-center text-sm font-semibold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        );
      case 'MATCHING':
        return (
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              {item.prompts?.map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {p}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {item.targets?.map((t, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                  {t}
                </div>
              ))}
            </div>
          </div>
        );
      case 'ORDERING':
        return (
          <div className="space-y-3">
            {item.options?.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <span className="text-xs font-bold text-slate-400">{i + 1}.</span>
                <span className="text-sm text-slate-700">{opt}</span>
              </div>
            ))}
          </div>
        );
      case 'NUMERIC_ENTRY':
        return (
          <div className="flex items-center gap-3">
            <input
              type="number"
              disabled
              placeholder="Enter numeric answer..."
              className="w-48 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
            />
            {item.units && <span className="text-sm font-semibold text-slate-500">{item.units}</span>}
          </div>
        );
      case 'SHORT_ANSWER':
        return (
          <textarea
            disabled
            placeholder="Type your answer here..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
            rows={3}
          />
        );
      case 'ESSAY':
        return (
          <div className="space-y-2">
            <textarea
              disabled
              placeholder="Write your essay here..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
              rows={8}
            />
            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
              <span>0 words</span>
              {item.lengthExpectation && (
                <span>Min: {item.lengthExpectation.minWords} | Max: {item.lengthExpectation.maxWords}</span>
              )}
            </div>
          </div>
        );
      case 'FILL_IN_THE_BLANK':
        return (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {item.prompt.split(/(\[\[.*?\]\])/).map((part, i) => {
              if (part.startsWith('[[') && part.endsWith(']]')) {
                return (
                  <input
                    key={i}
                    disabled
                    className="mx-1 w-24 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-xs"
                    placeholder="..."
                  />
                );
              }
              return part;
            })}
          </div>
        );
      case 'HOTSPOT':
        return (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200">
            <img src={item.imageUri} alt="Hotspot" className="w-full" />
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20 text-white text-xs font-bold">
              Interactive Hotspot Area
            </div>
          </div>
        );
      case 'DRAG_AND_DROP':
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {item.tokens?.map(t => (
                <div key={t.id} className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm">
                  {t.text}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {item.zones?.map(z => (
                <div key={z.id} className="min-h-[80px] rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{z.label}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case 'SCENARIO_TASK':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-slate-300">
              <p className="text-slate-500 mb-2">// Workspace Template</p>
              <pre className="whitespace-pre-wrap">{item.workspaceTemplate}</pre>
            </div>
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-8 text-slate-400">
              <p className="text-sm">Scenario Task Interface</p>
            </div>
          </div>
        );
      default:
        return <p className="text-slate-500 italic">Preview not available for this item type.</p>;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest mb-1" style={{ color: brandPrimary }}>Learner Preview</p>
            <h3 className="text-xl font-bold text-slate-900">{item.kind.replace(/_/g, ' ')}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="space-y-2">
            <p className="text-lg font-medium text-slate-900">{item.prompt}</p>
          </div>

          <div className="pt-4 border-t border-slate-50">
            {renderContent()}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-6 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
