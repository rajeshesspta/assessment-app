import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { ItemKind, Item } from '../utils/api';
import { useTenantConfig } from '../context/TenantConfigContext';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: any) => Promise<void>;
  initialItem?: Item | null;
  brandPrimary?: string;
}

export function CreateItemModal({ isOpen, onClose, onSave, initialItem, brandPrimary }: CreateItemModalProps) {
  const [kind, setKind] = useState<ItemKind>('MCQ');
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState<{ text: string }[]>([
    { text: '' },
    { text: '' },
  ]);
  const [correctIndexes, setCorrectIndexes] = useState<number[]>([0]);
  const [matchingPairs, setMatchingPairs] = useState<{ prompt: string; target: string }[]>([
    { prompt: '', target: '' },
    { prompt: '', target: '' },
  ]);
  const [orderingOptions, setOrderingOptions] = useState<string[]>(['', '']);
  const [numericValue, setNumericValue] = useState<number | ''>('');
  const [numericTolerance, setNumericTolerance] = useState<number>(0);
  const [numericUnits, setNumericUnits] = useState('');
  const [sampleAnswer, setSampleAnswer] = useState('');
  const [rubricKeywords, setRubricKeywords] = useState<string[]>([]);
  const [essayRubric, setEssayRubric] = useState<{ section: string; points: number }[]>([
    { section: 'Content', points: 5 },
    { section: 'Grammar', points: 5 },
  ]);
  const [minWords, setMinWords] = useState<number | ''>('');
  const [maxWords, setMaxWords] = useState<number | ''>('');
  const [blanks, setBlanks] = useState<{ key: string; correctValue: string }[]>([
    { key: 'blank1', correctValue: '' }
  ]);
  const [hotspotImage, setHotspotImage] = useState('');
  const [hotspotPolygons, setHotspotPolygons] = useState<{ id: string; points: { x: number; y: number }[] }[]>([]);
  const [dragTokens, setDragTokens] = useState<{ id: string; text: string }[]>([
    { id: 't1', text: '' }
  ]);
  const [dragZones, setDragZones] = useState<{ id: string; label: string; correctTokenIds: string[] }[]>([
    { id: 'z1', label: '', correctTokenIds: [] }
  ]);
  const [scenarioTemplate, setScenarioTemplate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});

  const { config } = useTenantConfig();

  useEffect(() => {
    if (initialItem) {
      setKind(initialItem.kind);
      setPrompt(initialItem.prompt);
      setCategories(initialItem.categories || []);
      setTags(initialItem.tags || []);
      setMetadata(initialItem.metadata || {});
      if (initialItem.kind === 'MCQ') {
        setChoices(initialItem.choices || []);
        setCorrectIndexes(initialItem.correctIndexes || []);
      } else if (initialItem.kind === 'TRUE_FALSE') {
        setCorrectIndexes([initialItem.answerIsTrue ? 0 : 1]);
      } else if (initialItem.kind === 'MATCHING') {
        setMatchingPairs((initialItem.prompts || []).map((p: string, i: number) => ({
          prompt: p,
          target: (initialItem.targets || [])[i] || ''
        })));
      } else if (initialItem.kind === 'ORDERING') {
        setOrderingOptions(initialItem.options || []);
      } else if (initialItem.kind === 'NUMERIC_ENTRY') {
        setNumericValue(initialItem.correctValue ?? '');
        setNumericTolerance(initialItem.tolerance || 0);
        setNumericUnits(initialItem.units || '');
      } else if (initialItem.kind === 'SHORT_ANSWER') {
        setSampleAnswer(initialItem.sampleAnswer || '');
        setRubricKeywords(initialItem.rubric?.keywords || []);
      } else if (initialItem.kind === 'ESSAY') {
        setEssayRubric(initialItem.rubric?.sections || []);
        setMinWords(initialItem.lengthExpectation?.minWords ?? '');
        setMaxWords(initialItem.lengthExpectation?.maxWords ?? '');
      } else if (initialItem.kind === 'FILL_IN_THE_BLANK') {
        setBlanks(initialItem.blanks || []);
      } else if (initialItem.kind === 'HOTSPOT') {
        setHotspotImage(initialItem.imageUri || '');
        setHotspotPolygons(initialItem.polygons || []);
      } else if (initialItem.kind === 'DRAG_AND_DROP') {
        setDragTokens(initialItem.tokens || []);
        setDragZones(initialItem.zones || []);
      } else if (initialItem.kind === 'SCENARIO_TASK') {
        setScenarioTemplate(initialItem.workspaceTemplate || '');
      }
    } else {
      // Reset to defaults for new item
      setKind('MCQ');
      setPrompt('');
      setChoices([{ text: '' }, { text: '' }]);
      setCorrectIndexes([0]);
      setMatchingPairs([{ prompt: '', target: '' }, { prompt: '', target: '' }]);
      setOrderingOptions(['', '']);
      setNumericValue('');
      setNumericTolerance(0);
      setNumericUnits('');
      setSampleAnswer('');
      setRubricKeywords([]);
      setEssayRubric([{ section: 'Content', points: 5 }, { section: 'Grammar', points: 5 }]);
      setMinWords('');
      setMaxWords('');
      setBlanks([{ key: 'blank1', correctValue: '' }]);
      setHotspotImage('');
      setHotspotPolygons([]);
      setDragTokens([{ id: 't1', text: '' }]);
      setDragZones([{ id: 'z1', label: '', correctTokenIds: [] }]);
      setScenarioTemplate('');
      setCategories([]);
      setTags([]);
      setMetadata({});
    }
  }, [initialItem, isOpen]);

  if (!isOpen) return null;

  const handleAddChoice = () => {
    setChoices([...choices, { text: '' }]);
  };

  const handleRemoveChoice = (index: number) => {
    if (choices.length <= 2) return;
    const newChoices = choices.filter((_, i) => i !== index);
    setChoices(newChoices);
    setCorrectIndexes(correctIndexes.filter(i => i !== index).map(i => i > index ? i - 1 : i));
  };

  const handleToggleCorrect = (index: number) => {
    if (kind === 'TRUE_FALSE') {
      setCorrectIndexes([index]);
      return;
    }
    if (correctIndexes.includes(index)) {
      if (correctIndexes.length > 1) {
        setCorrectIndexes(correctIndexes.filter(i => i !== index));
      }
    } else {
      setCorrectIndexes([...correctIndexes, index]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      let itemData: any;
      
      if (kind === 'MCQ') {
        itemData = {
          kind: 'MCQ',
          prompt,
          choices,
          correctIndexes,
          answerMode: correctIndexes.length > 1 ? 'multiple' : 'single',
        };
      } else if (kind === 'TRUE_FALSE') {
        itemData = {
          kind: 'TRUE_FALSE',
          prompt,
          answerIsTrue: correctIndexes[0] === 0,
        };
      } else if (kind === 'MATCHING') {
        itemData = {
          kind: 'MATCHING',
          prompt,
          prompts: matchingPairs.map(p => p.prompt),
          targets: matchingPairs.map(p => p.target),
          scoring: { mode: 'all' }
        };
      } else if (kind === 'ORDERING') {
        itemData = {
          kind: 'ORDERING',
          prompt,
          options: orderingOptions,
          correctOrder: orderingOptions.map((_, i) => i),
          scoring: { mode: 'all' }
        };
      } else if (kind === 'NUMERIC_ENTRY') {
        itemData = {
          kind: 'NUMERIC_ENTRY',
          prompt,
          correctValue: Number(numericValue),
          tolerance: numericTolerance,
          units: numericUnits || undefined,
        };
      } else if (kind === 'SHORT_ANSWER') {
        itemData = {
          kind: 'SHORT_ANSWER',
          prompt,
          sampleAnswer,
          rubric: { keywords: rubricKeywords },
          scoring: { mode: 'manual' }
        };
      } else if (kind === 'ESSAY') {
        itemData = {
          kind: 'ESSAY',
          prompt,
          rubric: { sections: essayRubric },
          lengthExpectation: {
            minWords: minWords === '' ? undefined : Number(minWords),
            maxWords: maxWords === '' ? undefined : Number(maxWords),
          },
          scoring: { mode: 'manual' }
        };
      } else if (kind === 'FILL_IN_THE_BLANK') {
        itemData = {
          kind: 'FILL_IN_THE_BLANK',
          prompt,
          blanks,
          scoring: { mode: 'all' }
        };
      } else if (kind === 'HOTSPOT') {
        itemData = {
          kind: 'HOTSPOT',
          prompt,
          imageUri: hotspotImage,
          polygons: hotspotPolygons,
          scoring: { mode: 'all' }
        };
      } else if (kind === 'DRAG_AND_DROP') {
        itemData = {
          kind: 'DRAG_AND_DROP',
          prompt,
          tokens: dragTokens,
          zones: dragZones,
          scoring: { mode: 'all' }
        };
      } else if (kind === 'SCENARIO_TASK') {
        itemData = {
          kind: 'SCENARIO_TASK',
          prompt,
          workspaceTemplate: scenarioTemplate,
          scoring: { mode: 'manual' }
        };
      }

      // Add taxonomy fields
      itemData.categories = categories.length > 0 ? categories : undefined;
      itemData.tags = tags.length > 0 ? tags : undefined;
      itemData.metadata = Object.keys(metadata).length > 0 ? metadata : undefined;

      await onSave(itemData);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">
            {initialItem ? 'Edit Item' : 'Create New Item'}
          </h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Item Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { id: 'MCQ', label: 'Multiple Choice', desc: 'Single/Multiple correct' },
                { id: 'TRUE_FALSE', label: 'True / False', desc: 'Binary choice' },
                { id: 'MATCHING', label: 'Matching', desc: 'Pair items together' },
                { id: 'ORDERING', label: 'Ordering', desc: 'Sequence items' },
                { id: 'NUMERIC_ENTRY', label: 'Numeric', desc: 'Exact or range' },
                { id: 'SHORT_ANSWER', label: 'Short Answer', desc: 'Brief text response' },
                { id: 'ESSAY', label: 'Essay', desc: 'Long form writing' },
                { id: 'FILL_IN_THE_BLANK', label: 'Fill Blanks', desc: 'Complete the text' },
                { id: 'HOTSPOT', label: 'Hotspot', desc: 'Click on image' },
                { id: 'DRAG_AND_DROP', label: 'Drag & Drop', desc: 'Categorize items' },
                { id: 'SCENARIO_TASK', label: 'Scenario', desc: 'Complex task' },
              ].map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setKind(type.id as any)}
                  className={`rounded-xl border-2 p-3 text-left transition ${kind === type.id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-100 hover:border-slate-200'}`}
                  style={kind === type.id ? { borderColor: brandPrimary, backgroundColor: `${brandPrimary}08` } : {}}
                >
                  <p className="font-bold text-slate-900 text-sm">{type.label}</p>
                  <p className="text-[10px] text-slate-500 leading-tight">{type.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Prompt</label>
            <textarea
              required
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter the question or instruction..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
              rows={3}
            />
          </div>

          {kind === 'MCQ' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Choices</label>
                <button
                  type="button"
                  onClick={handleAddChoice}
                  className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                  style={{ color: brandPrimary }}
                >
                  <Plus className="h-3 w-3" />
                  Add Choice
                </button>
              </div>
              <div className="space-y-3">
                {choices.map((choice, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleCorrect(index)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${correctIndexes.includes(index) ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-transparent'}`}
                      style={correctIndexes.includes(index) ? { backgroundColor: brandPrimary, borderColor: brandPrimary } : {}}
                    >
                      <div className="h-2 w-2 rounded-full bg-current" />
                    </button>
                    <input
                      type="text"
                      required
                      value={choice.text}
                      onChange={e => {
                        const newChoices = [...choices];
                        newChoices[index].text = e.target.value;
                        setChoices(newChoices);
                      }}
                      placeholder={`Choice ${index + 1}`}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveChoice(index)}
                      disabled={choices.length <= 2}
                      className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kind === 'TRUE_FALSE' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Correct Answer</label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setCorrectIndexes([0])}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold transition ${correctIndexes[0] === 0 ? 'border-brand-500 bg-brand-50/50 text-brand-700' : 'border-slate-100 text-slate-500'}`}
                  style={correctIndexes[0] === 0 ? { borderColor: brandPrimary, backgroundColor: `${brandPrimary}08`, color: brandPrimary } : {}}
                >
                  True
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectIndexes([1])}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold transition ${correctIndexes[0] === 1 ? 'border-brand-500 bg-brand-50/50 text-brand-700' : 'border-slate-100 text-slate-500'}`}
                  style={correctIndexes[0] === 1 ? { borderColor: brandPrimary, backgroundColor: `${brandPrimary}08`, color: brandPrimary } : {}}
                >
                  False
                </button>
              </div>
            </div>
          )}

          {kind === 'MATCHING' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Matching Pairs</label>
                <button
                  type="button"
                  onClick={() => setMatchingPairs([...matchingPairs, { prompt: '', target: '' }])}
                  className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                  style={{ color: brandPrimary }}
                >
                  <Plus className="h-3 w-3" />
                  Add Pair
                </button>
              </div>
              <div className="space-y-3">
                {matchingPairs.map((pair, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="text"
                      required
                      value={pair.prompt}
                      onChange={e => {
                        const newPairs = [...matchingPairs];
                        newPairs[index].prompt = e.target.value;
                        setMatchingPairs(newPairs);
                      }}
                      placeholder="Prompt"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                    <span className="text-slate-400">→</span>
                    <input
                      type="text"
                      required
                      value={pair.target}
                      onChange={e => {
                        const newPairs = [...matchingPairs];
                        newPairs[index].target = e.target.value;
                        setMatchingPairs(newPairs);
                      }}
                      placeholder="Target"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                    <button
                      type="button"
                      onClick={() => setMatchingPairs(matchingPairs.filter((_, i) => i !== index))}
                      disabled={matchingPairs.length <= 2}
                      className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kind === 'ORDERING' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Items in Correct Order</label>
                <button
                  type="button"
                  onClick={() => setOrderingOptions([...orderingOptions, ''])}
                  className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                  style={{ color: brandPrimary }}
                >
                  <Plus className="h-3 w-3" />
                  Add Item
                </button>
              </div>
              <div className="space-y-3">
                {orderingOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-4">{index + 1}.</span>
                    <input
                      type="text"
                      required
                      value={option}
                      onChange={e => {
                        const newOptions = [...orderingOptions];
                        newOptions[index] = e.target.value;
                        setOrderingOptions(newOptions);
                      }}
                      placeholder={`Item ${index + 1}`}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                    <button
                      type="button"
                      onClick={() => setOrderingOptions(orderingOptions.filter((_, i) => i !== index))}
                      disabled={orderingOptions.length <= 2}
                      className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kind === 'NUMERIC_ENTRY' && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Correct Value</label>
                <input
                  type="number"
                  required
                  value={numericValue}
                  onChange={e => setNumericValue(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tolerance (±)</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={numericTolerance}
                  onChange={e => setNumericTolerance(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Units (Optional)</label>
                <input
                  type="text"
                  value={numericUnits}
                  onChange={e => setNumericUnits(e.target.value)}
                  placeholder="e.g., kg, m/s"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                />
              </div>
            </div>
          )}

          {kind === 'SHORT_ANSWER' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Sample Answer</label>
                <textarea
                  value={sampleAnswer}
                  onChange={e => setSampleAnswer(e.target.value)}
                  placeholder="Provide a model answer for reference..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Keywords (for auto-grading hint)</label>
                <input
                  type="text"
                  placeholder="Enter keywords separated by commas..."
                  value={rubricKeywords.join(', ')}
                  onChange={e => setRubricKeywords(e.target.value.split(',').map(k => k.trim()).filter(k => k))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                />
              </div>
            </div>
          )}

          {kind === 'ESSAY' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Min Words</label>
                  <input
                    type="number"
                    value={minWords}
                    onChange={e => setMinWords(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Max Words</label>
                  <input
                    type="number"
                    value={maxWords}
                    onChange={e => setMaxWords(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Rubric Sections</label>
                  <button
                    type="button"
                    onClick={() => setEssayRubric([...essayRubric, { section: '', points: 5 }])}
                    className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                    style={{ color: brandPrimary }}
                  >
                    <Plus className="h-3 w-3" />
                    Add Section
                  </button>
                </div>
                <div className="space-y-3">
                  {essayRubric.map((section, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <input
                        type="text"
                        required
                        value={section.section}
                        onChange={e => {
                          const newRubric = [...essayRubric];
                          newRubric[index].section = e.target.value;
                          setEssayRubric(newRubric);
                        }}
                        placeholder="Section Name (e.g., Structure)"
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                      />
                      <input
                        type="number"
                        required
                        value={section.points}
                        onChange={e => {
                          const newRubric = [...essayRubric];
                          newRubric[index].points = Number(e.target.value);
                          setEssayRubric(newRubric);
                        }}
                        className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                      />
                      <button
                        type="button"
                        onClick={() => setEssayRubric(essayRubric.filter((_, i) => i !== index))}
                        disabled={essayRubric.length <= 1}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {kind === 'FILL_IN_THE_BLANK' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Blanks</label>
                <button
                  type="button"
                  onClick={() => setBlanks([...blanks, { key: `blank${blanks.length + 1}`, correctValue: '' }])}
                  className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                  style={{ color: brandPrimary }}
                >
                  <Plus className="h-3 w-3" />
                  Add Blank
                </button>
              </div>
              <div className="space-y-3">
                {blanks.map((blank, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="text"
                      required
                      value={blank.key}
                      onChange={e => {
                        const newBlanks = [...blanks];
                        newBlanks[index].key = e.target.value;
                        setBlanks(newBlanks);
                      }}
                      placeholder="Key (e.g., blank1)"
                      className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                    <input
                      type="text"
                      required
                      value={blank.correctValue}
                      onChange={e => {
                        const newBlanks = [...blanks];
                        newBlanks[index].correctValue = e.target.value;
                        setBlanks(newBlanks);
                      }}
                      placeholder="Correct Value"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                    <button
                      type="button"
                      onClick={() => setBlanks(blanks.filter((_, i) => i !== index))}
                      disabled={blanks.length <= 1}
                      className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 italic">Use the keys in your prompt like: "The capital of France is [[blank1]]."</p>
            </div>
          )}

          {kind === 'HOTSPOT' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Image URL</label>
                <input
                  type="url"
                  required
                  value={hotspotImage}
                  onChange={e => setHotspotImage(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                />
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-xs text-slate-500">Hotspot polygon editor would go here. For now, polygons are managed via API or JSON.</p>
              </div>
            </div>
          )}

          {kind === 'DRAG_AND_DROP' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Tokens (Draggable Items)</label>
                  <button
                    type="button"
                    onClick={() => setDragTokens([...dragTokens, { id: `t${dragTokens.length + 1}`, text: '' }])}
                    className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                    style={{ color: brandPrimary }}
                  >
                    <Plus className="h-3 w-3" />
                    Add Token
                  </button>
                </div>
                <div className="space-y-3">
                  {dragTokens.map((token, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 w-6">{token.id}</span>
                      <input
                        type="text"
                        required
                        value={token.text}
                        onChange={e => {
                          const newTokens = [...dragTokens];
                          newTokens[index].text = e.target.value;
                          setDragTokens(newTokens);
                        }}
                        placeholder="Token Text"
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                      />
                      <button
                        type="button"
                        onClick={() => setDragTokens(dragTokens.filter((_, i) => i !== index))}
                        disabled={dragTokens.length <= 1}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Zones (Drop Targets)</label>
                  <button
                    type="button"
                    onClick={() => setDragZones([...dragZones, { id: `z${dragZones.length + 1}`, label: '', correctTokenIds: [] }])}
                    className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                    style={{ color: brandPrimary }}
                  >
                    <Plus className="h-3 w-3" />
                    Add Zone
                  </button>
                </div>
                <div className="space-y-3">
                  {dragZones.map((zone, index) => (
                    <div key={index} className="space-y-2 rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-6">{zone.id}</span>
                        <input
                          type="text"
                          required
                          value={zone.label}
                          onChange={e => {
                            const newZones = [...dragZones];
                            newZones[index].label = e.target.value;
                            setDragZones(newZones);
                          }}
                          placeholder="Zone Label"
                          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                        />
                        <button
                          type="button"
                          onClick={() => setDragZones(dragZones.filter((_, i) => i !== index))}
                          disabled={dragZones.length <= 1}
                          className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Correct Tokens (IDs)</label>
                        <input
                          type="text"
                          placeholder="e.g., t1, t2"
                          value={zone.correctTokenIds.join(', ')}
                          onChange={e => {
                            const newZones = [...dragZones];
                            newZones[index].correctTokenIds = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                            setDragZones(newZones);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {kind === 'SCENARIO_TASK' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Workspace Template (Markdown/JSON)</label>
                <textarea
                  value={scenarioTemplate}
                  onChange={e => setScenarioTemplate(e.target.value)}
                  placeholder="Define the initial state of the workspace..."
                  className="w-full font-mono rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  rows={8}
                />
              </div>
            </div>
          )}

          {/* Taxonomy Fields */}
          {config?.taxonomy && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-slate-700">Taxonomy</h4>
              
              {config.taxonomy.categories.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Categories</label>
                  <select
                    multiple
                    value={categories}
                    onChange={e => setCategories(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  >
                    {config.taxonomy.categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              {config.taxonomy.tags.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Tags</label>
                  <select
                    multiple
                    value={tags}
                    onChange={e => setTags(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                  >
                    {config.taxonomy.tags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
              )}

              {config.taxonomy.metadataFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </label>
                  {field.type === 'string' && (
                    <input
                      type="text"
                      required={field.required}
                      value={metadata[field.key] || ''}
                      onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                  )}
                  {field.type === 'number' && (
                    <input
                      type="number"
                      required={field.required}
                      value={metadata[field.key] || ''}
                      onChange={e => setMetadata({ ...metadata, [field.key]: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    />
                  )}
                  {field.type === 'boolean' && (
                    <select
                      required={field.required}
                      value={metadata[field.key] ? 'true' : 'false'}
                      onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value === 'true' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    >
                      <option value="false">False</option>
                      <option value="true">True</option>
                    </select>
                  )}
                  {field.type === 'enum' && field.allowedValues && (
                    <select
                      required={field.required}
                      value={metadata[field.key] || ''}
                      onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/40"
                    >
                      <option value="">Select...</option>
                      {field.allowedValues.map(val => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  )}
                  {field.description && (
                    <p className="text-xs text-slate-500">{field.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-brand-500 px-6 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
              style={{ backgroundColor: brandPrimary }}
            >
              {isSubmitting ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
