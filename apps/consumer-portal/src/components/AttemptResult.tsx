import { ChevronLeft, CheckCircle, AlertCircle, Clock, Target } from 'lucide-react';
import type { AttemptResponse, Assessment, Item } from '../utils/api';
import { useEffect, useState } from 'react';
import { LoadingState } from './LoadingState';

interface AttemptResultProps {
  attemptId: string;
  api: any;
  brandPrimary?: string;
  onExit: () => void;
}

export function AttemptResult({ attemptId, api, brandPrimary = '#f97316', onExit }: AttemptResultProps) {
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewItems, setReviewItems] = useState<Item[] | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewForbidden, setReviewForbidden] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const attemptData = await api.fetchAttempt(attemptId);
        setAttempt(attemptData);

        const assessmentData = await api.fetchAssessment(attemptData.assessmentId);
        setAssessment(assessmentData);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [attemptId, api]);

  /*
  // const renderItemReview = (item: Item, response: AttemptResponse | undefined) => {
    switch (item.kind) {
      case 'MCQ':
      case 'TRUE_FALSE':
        return (
          <div className="space-y-1">
            {item.choices?.map((choice, choiceIndex) => {
              const isCorrect = (item as any).correctIndexes?.includes(choiceIndex);
              const isSelected = response?.answerIndexes?.includes(choiceIndex);
              let className = 'text-slate-600';
              if (isCorrect && isSelected) {
                className = 'text-green-700 font-semibold bg-green-50';
              } else if (isCorrect) {
                className = 'text-green-700 font-semibold';
              } else if (isSelected) {
                className = 'text-blue-700 font-semibold bg-blue-50';
              }
              return (
                <div key={choiceIndex} className="flex items-center gap-2 text-sm">
                  <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-xs">
                    {String.fromCharCode(65 + choiceIndex)}
                  </span>
                  <span className={className}>
                    {choice.text}
                  </span>
                </div>
              );
            })}
          </div>
        );

      case 'FILL_IN_THE_BLANK':
        const fillBlankItem = item as any;
        return (
          <div className="space-y-2">
            {fillBlankItem.blanks?.map((blank: any, blankIndex: number) => {
              const userAnswer = response?.textAnswers?.[blankIndex];
              const isCorrect = blank.acceptableAnswers.some((matcher: any) => {
                if (matcher.type === 'exact') {
                  return matcher.caseSensitive ? userAnswer === matcher.value : userAnswer?.toLowerCase() === matcher.value.toLowerCase();
                }
                // For regex and other types, simplified check
                return false;
              });
              return (
                <div key={blankIndex} className="p-2 bg-slate-50 rounded text-sm">
                  <div className="font-medium text-slate-700">Blank {blankIndex + 1}:</div>
                  <div className={`mt-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    Your answer: {userAnswer || 'Not answered'}
                  </div>
                  <div className="text-green-700 mt-1">
                    Correct answers: {blank.acceptableAnswers.map((a: any) => a.value || a.pattern).join(', ')}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'MATCHING':
        const matchingItem = item as any;
        return (
          <div className="space-y-2">
            {matchingItem.prompts?.map((prompt: any, promptIndex: number) => {
              const userMatch = response?.matchingAnswers?.find((m: any) => m.promptId === prompt.id);
              const correctTarget = matchingItem.targets?.find((t: any) => t.id === prompt.correctTargetId);
              const userTarget = matchingItem.targets?.find((t: any) => t.id === userMatch?.targetId);
              const isCorrect = userMatch?.targetId === prompt.correctTargetId;
              return (
                <div key={promptIndex} className="p-2 bg-slate-50 rounded text-sm">
                  <div className="font-medium text-slate-700">{prompt.text}</div>
                  <div className={`mt-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    Your match: {userTarget?.text || 'Not matched'}
                  </div>
                  <div className="text-green-700 mt-1">
                    Correct: {correctTarget?.text}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'ORDERING':
        const orderingItem = item as any;
        const correctOrder = orderingItem.correctOrder || [];
        const userOrder = response?.orderingAnswer || [];
        return (
          <div className="space-y-2">
            <div className="text-sm">
              <div className="font-medium text-slate-700 mb-2">Your order:</div>
              <div className="space-y-1">
                {userOrder.map((optionId: string, idx: number) => {
                  const option = orderingItem.options?.find((o: any) => o.id === optionId);
                  const correctIndex = correctOrder.indexOf(optionId);
                  const isCorrect = idx === correctIndex;
                  return (
                    <div key={optionId} className={`flex items-center gap-2 p-1 rounded ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <span className="text-xs font-bold">{idx + 1}.</span>
                      <span>{option?.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium text-green-700 mb-2">Correct order:</div>
              <div className="space-y-1">
                {correctOrder.map((optionId: string, idx: number) => {
                  const option = orderingItem.options?.find((o: any) => o.id === optionId);
                  return (
                    <div key={optionId} className="flex items-center gap-2 p-1 rounded bg-green-50 text-green-700">
                      <span className="text-xs font-bold">{idx + 1}.</span>
                      <span>{option?.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'SHORT_ANSWER':
      case 'ESSAY':
        const textAnswer = response?.textAnswers?.[0] || response?.essayAnswer;
        const essayItem = item as any;
        return (
          <div className="space-y-2">
            <div className="p-3 bg-slate-50 rounded text-sm">
              <div className="font-medium text-slate-700 mb-1">Your answer:</div>
              <div className="text-slate-900 whitespace-pre-wrap">{textAnswer || 'Not answered'}</div>
            </div>
            {essayItem.rubric?.sampleAnswer && (
              <div className="p-3 bg-green-50 rounded text-sm">
                <div className="font-medium text-green-700 mb-1">Sample answer:</div>
                <div className="text-green-800 whitespace-pre-wrap">{essayItem.rubric.sampleAnswer}</div>
              </div>
            )}
          </div>
        );

      case 'NUMERIC_ENTRY':
        const numericItem = item as any;
        const userNumeric = response?.numericAnswer;
        const correctValue = (numericItem.validation as any)?.value;
        const isNumericCorrect = userNumeric?.value === correctValue;
        return (
          <div className="space-y-2">
            <div className={`p-3 rounded text-sm ${isNumericCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="font-medium text-slate-700 mb-1">Your answer:</div>
              <div className={isNumericCorrect ? 'text-green-700' : 'text-red-700'}>
                {userNumeric?.value ?? 'Not answered'} {userNumeric?.unit || numericItem.units?.label}
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded text-sm">
              <div className="font-medium text-green-700 mb-1">Correct answer:</div>
              <div className="text-green-800">
                {correctValue} {numericItem.units?.label}
              </div>
            </div>
          </div>
        );

      case 'HOTSPOT':
        // Simplified display for hotspot
        return (
          <div className="p-3 bg-slate-50 rounded text-sm">
            <div className="font-medium text-slate-700">Hotspot item - Review requires image display</div>
            <div className="text-slate-600 mt-1">Your selections: {response?.hotspotAnswers?.length || 0} points</div>
          </div>
        );

      case 'DRAG_AND_DROP':
        // Simplified display for drag and drop
        return (
          <div className="p-3 bg-slate-50 rounded text-sm">
            <div className="font-medium text-slate-700">Drag and Drop item</div>
            <div className="text-slate-600 mt-1">Your placements: {response?.dragDropAnswers?.length || 0} items</div>
          </div>
        );

      case 'SCENARIO_TASK':
        return (
          <div className="p-3 bg-slate-50 rounded text-sm">
            <div className="font-medium text-slate-700">Scenario task</div>
            <div className="text-slate-600 mt-1">Submission: {response?.scenarioAnswer?.repositoryUrl ? 'Repository submitted' : 'Not submitted'}</div>
          </div>
        );

      default:
        return <div className="text-sm text-slate-600">Item type not supported for review</div>;
    }
  };
  */

  const renderItemReview = (item: Item, response: AttemptResponse | undefined) => {
    switch (item.kind) {
      case 'MCQ':
      case 'TRUE_FALSE':
        return (
          <div className="space-y-1">
            {item.choices?.map((choice, choiceIndex) => {
              const isCorrect = (item as any).correctIndexes?.includes(choiceIndex);
              const isSelected = response?.answerIndexes?.includes(choiceIndex);
              let className = 'text-slate-600';
              if (isCorrect && isSelected) {
                className = 'text-green-700 font-semibold bg-green-50';
              } else if (isCorrect) {
                className = 'text-green-700 font-semibold';
              } else if (isSelected) {
                className = 'text-blue-700 font-semibold bg-blue-50';
              }
              return (
                <div key={choiceIndex} className="flex items-center gap-2 text-sm">
                  <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-xs">
                    {String.fromCharCode(65 + choiceIndex)}
                  </span>
                  <span className={className}>
                    {choice.text}
                  </span>
                </div>
              );
            })}
          </div>
        );

      case 'FILL_IN_THE_BLANK':
        const fillBlankItem = item as any;
        return (
          <div className="space-y-2">
            {fillBlankItem.blanks?.map((blank: any, blankIndex: number) => {
              const userAnswer = response?.textAnswers?.[blankIndex];
              const isCorrect = blank.acceptableAnswers.some((matcher: any) => {
                if (matcher.type === 'exact') {
                  return matcher.caseSensitive ? userAnswer === matcher.value : userAnswer?.toLowerCase() === matcher.value.toLowerCase();
                }
                // For regex and other types, simplified check
                return false;
              });
              return (
                <div key={blankIndex} className="p-2 bg-slate-50 rounded text-sm">
                  <div className="font-medium text-slate-700">Blank {blankIndex + 1}:</div>
                  <div className={`mt-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    Your answer: {userAnswer || 'Not answered'}
                  </div>
                  <div className="text-green-700 mt-1">
                    Correct answers: {blank.acceptableAnswers.map((a: any) => a.value || a.pattern).join(', ')}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'MATCHING':
        const matchingItem = item as any;
        return (
          <div className="space-y-2">
            {matchingItem.prompts?.map((prompt: any, promptIndex: number) => {
              const userMatch = response?.matchingAnswers?.find((m: any) => m.promptId === prompt.id);
              const correctTarget = matchingItem.targets?.find((t: any) => t.id === prompt.correctTargetId);
              const userTarget = matchingItem.targets?.find((t: any) => t.id === userMatch?.targetId);
              const isCorrect = userMatch?.targetId === prompt.correctTargetId;
              return (
                <div key={promptIndex} className="p-2 bg-slate-50 rounded text-sm">
                  <div className="font-medium text-slate-700">{prompt.text}</div>
                  <div className={`mt-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    Your match: {userTarget?.text || 'Not matched'}
                  </div>
                  <div className="text-green-700 mt-1">
                    Correct: {correctTarget?.text}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'ORDERING':
        const orderingItem = item as any;
        const correctOrder = orderingItem.correctOrder || [];
        const userOrder = response?.orderingAnswer || [];
        return (
          <div className="space-y-2">
            <div className="text-sm">
              <div className="font-medium text-slate-700 mb-2">Your order:</div>
              <div className="space-y-1">
                {userOrder.map((optionId: string, idx: number) => {
                  const option = orderingItem.options?.find((o: any) => o.id === optionId);
                  const correctIndex = correctOrder.indexOf(optionId);
                  const isCorrect = idx === correctIndex;
                  return (
                    <div key={optionId} className={`flex items-center gap-2 p-1 rounded ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <span className="text-xs font-bold">{idx + 1}.</span>
                      <span>{option?.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium text-green-700 mb-2">Correct order:</div>
              <div className="space-y-1">
                {correctOrder.map((optionId: string, idx: number) => {
                  const option = orderingItem.options?.find((o: any) => o.id === optionId);
                  return (
                    <div key={optionId} className={`flex items-center gap-2 p-1 rounded bg-green-50 text-green-700`}>
                      <span className="text-xs font-bold">{idx + 1}.</span>
                      <span>{option?.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'SHORT_ANSWER':
      case 'ESSAY':
        const textAnswer = response?.textAnswers?.[0] || response?.essayAnswer;
        const essayItem = item as any;
        return (
          <div className="space-y-2">
            <div className="p-3 bg-slate-50 rounded text-sm">
              <div className="font-medium text-slate-700 mb-1">Your answer:</div>
              <div className="text-slate-900 whitespace-pre-wrap">{textAnswer || 'Not answered'}</div>
            </div>
            {essayItem.rubric?.sampleAnswer && (
              <div className="p-3 bg-green-50 rounded text-sm">
                <div className="font-medium text-green-700 mb-1">Sample answer:</div>
                <div className="text-green-800 whitespace-pre-wrap">{essayItem.rubric.sampleAnswer}</div>
              </div>
            )}
          </div>
        );

      case 'NUMERIC_ENTRY':
        const numericItem = item as any;
        const userNumeric = response?.numericAnswer;
        const correctValue = (numericItem.validation as any)?.value;
        const isNumericCorrect = userNumeric?.value === correctValue;
        return (
          <div className="space-y-2">
            <div className={`p-3 rounded text-sm ${isNumericCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="font-medium text-slate-700 mb-1">Your answer:</div>
              <div className={isNumericCorrect ? 'text-green-700' : 'text-red-700'}>
                {userNumeric?.value ?? 'Not answered'} {userNumeric?.unit || numericItem.units?.label}
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded text-sm">
              <div className="font-medium text-green-700 mb-1">Correct answer:</div>
              <div className="text-green-800">
                {correctValue} {numericItem.units?.label}
              </div>
            </div>
          </div>
        );

      case 'HOTSPOT':
        // Simplified display for hotspot
        return (
          <div className="p-3 bg-slate-50 rounded text-sm">
            <div className="font-medium text-slate-700">Hotspot item - Review requires image display</div>
            <div className="text-slate-600 mt-1">Your selections: {response?.hotspotAnswers?.length || 0} points</div>
          </div>
        );

      case 'DRAG_AND_DROP':
        // Simplified display for drag and drop
        return (
          <div className="p-3 bg-slate-50 rounded text-sm">
            <div className="font-medium text-slate-700">Drag and Drop item</div>
            <div className="text-slate-600 mt-1">Your placements: {response?.dragDropAnswers?.length || 0} items</div>
          </div>
        );

      case 'SCENARIO_TASK':
        return (
          <div className="p-3 bg-slate-50 rounded text-sm">
            <div className="font-medium text-slate-700">Scenario task</div>
            <div className="text-slate-600 mt-1">Submission: {response?.scenarioAnswer?.repositoryUrl ? 'Repository submitted' : 'Not submitted'}</div>
          </div>
        );

      default:
        return <div className="text-sm text-slate-600">Item type not supported for review</div>;
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingState label="Loading results..." /></div>;
  if (error) return <div className="p-8 text-rose-600">Error: {error}</div>;
  if (!attempt || !assessment) return <div className="p-8">No data found.</div>;

  const isScored = attempt.status === 'scored';
  const isSubmitted = attempt.status === 'submitted';
  const scorePercentage = attempt.maxScore ? Math.round((attempt.score || 0) / attempt.maxScore * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">Assessment Results</h1>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-12">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Summary Card */}
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-center">
            {isScored ? (
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-6">
                <CheckCircle className="h-10 w-10" />
              </div>
            ) : (
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-sky-100 text-sky-600 mb-6">
                <Clock className="h-10 w-10" />
              </div>
            )}

            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isScored ? 'Assessment Completed!' : 'Submission Received'}
            </h2>
            <p className="text-slate-500 max-w-md mx-auto">
              {isScored 
                ? `You've successfully completed ${assessment.title}. Your results are available below.`
                : `Your responses for ${assessment.title} have been submitted. Some items may require manual grading.`}
            </p>

            {isScored && (
              <div className="mt-10 grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div className="rounded-2xl bg-slate-50 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Score</p>
                  <p className="text-3xl font-bold text-slate-900">{attempt.score} / {attempt.maxScore}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Percentage</p>
                  <p className="text-3xl font-bold" style={{ color: brandPrimary }}>{scorePercentage}%</p>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Target className="h-5 w-5 text-brand-500" />
                <h3 className="font-bold text-slate-900">Assessment Info</h3>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Title</dt>
                  <dd className="font-semibold text-slate-900">{assessment.title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Items</dt>
                  <dd className="font-semibold text-slate-900">{assessment.itemIds.length}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-5 w-5 text-brand-500" />
                <h3 className="font-bold text-slate-900">Attempt Info</h3>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-semibold text-slate-900 capitalize">{attempt.status.replace('_', ' ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Submitted At</dt>
                  <dd className="font-semibold text-slate-900">{new Date(attempt.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>

          {!isScored && (
            <div className="rounded-2xl bg-amber-50 p-6 border border-amber-200 flex gap-4">
              <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="font-bold text-amber-900">Pending Evaluation</h4>
                <p className="text-sm text-amber-800 mt-1">
                  This assessment contains items that require manual review or AI evaluation. 
                  Your final score will be updated once the review is complete.
                </p>
              </div>
            </div>
          )}

          {/* Review Items - lazy loaded when assessment requests reveal */}
          {(assessment && assessment.revealDetailsAfterCompletion) && (
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Review Questions</h3>

              {!showReview && (
                <div className="flex items-center justify-between gap-4">
                  {assessment && assessment.revealDetailsAfterCompletion ? (
                    (attempt.status === 'submitted' || attempt.status === 'scored') ? (
                      <>
                        <p className="text-sm text-slate-600">Details are hidden until you request them.</p>
                        <div className="flex items-center gap-2">
                          <button
                            disabled={reviewForbidden}
                            onClick={async () => {
                              setShowReview(true);
                              if (reviewItems || loadingReview) return;
                              setLoadingReview(true);
                              setReviewError(null);
                              try {
                                const items = await api.fetchAttemptItems(attemptId);
                                setReviewItems(items);
                              } catch (err) {
                                const msg = (err as Error).message || '';
                                if (msg.toLowerCase().includes('forbid') || msg.includes('403')) {
                                  setReviewForbidden(true);
                                  setReviewError('You do not have permission to view review questions.');
                                } else {
                                  setReviewError(msg || 'Failed to load review items');
                                }
                              } finally {
                                setLoadingReview(false);
                              }
                            }}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Review assessments
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">Review will be available after submission.</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-600">Review items are not available for reveal.</p>
                  )}
                </div>
              )}

              {showReview && (
                <div>
                  {/* Legend */}
                  <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">Answer Key</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-green-50 border border-green-200"></div>
                        <span className="text-green-700 font-medium">Correct Answer</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-blue-50 border border-blue-200"></div>
                        <span className="text-blue-700 font-medium">Your Answer</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-green-50 border border-green-200"></div>
                        <span className="text-green-700 font-medium">Correct & Selected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-red-50 border border-red-200"></div>
                        <span className="text-red-700 font-medium">Incorrect Answer</span>
                      </div>
                    </div>
                  </div>

                  {loadingReview && <div className="py-6"><LoadingState label="Loading review questions..." /></div>}
                  {reviewError && <div className="text-rose-600">{reviewError}</div>}

                  {reviewItems && reviewItems.length === 0 && (
                    <div className="p-4 text-sm text-slate-600">No review items found for this attempt.</div>
                  )}

                  {reviewItems && reviewItems.length > 0 && (
                    <div className="space-y-6">
                      {reviewItems.map((item, index) => {
                        const response = attempt.responses?.find(r => r.itemId === item.id);
                        return (
                          <div key={item.id} className="border border-slate-100 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                                {index + 1}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-slate-900 mb-2">{item.prompt}</p>
                                {renderItemReview(item, response)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              onClick={onExit}
              className="rounded-xl bg-slate-900 px-8 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
