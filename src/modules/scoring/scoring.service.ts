// Placeholder for future complex scoring strategies (rubrics, partial credit, adaptive)
import type {
  AttemptResponse,
  MatchingItem,
  OrderingItem,
} from '../../common/types.js';

export interface ScoringResult { score: number; maxScore: number; }

export function simpleMcqScore(correct: number, total: number): ScoringResult {
  return { score: correct, maxScore: total };
}

export function scoreMatchingItem(item: MatchingItem, answers?: AttemptResponse['matchingAnswers']): ScoringResult {
  const prompts = item.prompts ?? [];
  const mode = item.scoring?.mode ?? 'partial';
  const maxScore = mode === 'partial' ? prompts.length : (prompts.length > 0 ? 1 : 0);
  if (!prompts.length) {
    return { score: 0, maxScore };
  }
  const providedByPrompt = new Map<string, string>();
  for (const answer of answers ?? []) {
    if (!providedByPrompt.has(answer.promptId)) {
      providedByPrompt.set(answer.promptId, answer.targetId);
    }
  }
  const correctMatches = prompts.reduce((total, prompt) => {
    const expectedTarget = prompt.correctTargetId;
    const providedTarget = providedByPrompt.get(prompt.id);
    return expectedTarget && providedTarget === expectedTarget ? total + 1 : total;
  }, 0);
  if (mode === 'partial') {
    return { score: correctMatches, maxScore };
  }
  const allCorrect = correctMatches === prompts.length && prompts.length > 0;
  return { score: allCorrect ? 1 : 0, maxScore };
}

export function scoreOrderingItem(item: OrderingItem, answer?: string[]): ScoringResult {
  const correctOrder = item.correctOrder ?? [];
  const mode = item.scoring?.mode ?? 'all';
  const maxScore = mode === 'partial_pairs'
    ? (correctOrder.length * (correctOrder.length - 1)) / 2
    : (correctOrder.length > 0 ? 1 : 0);
  if (!correctOrder.length) {
    return { score: 0, maxScore };
  }
  if (item.scoring?.customEvaluatorId) {
    return { score: 0, maxScore };
  }
  if (mode === 'all') {
    const isCorrect = Array.isArray(answer)
      && answer.length === correctOrder.length
      && correctOrder.every((value, index) => value === answer[index]);
    return { score: isCorrect ? 1 : 0, maxScore };
  }
  const providedOrder = Array.isArray(answer) ? answer : [];
  const providedIndex = new Map(providedOrder.map((optionId, index) => [optionId, index] as const));
  let correctPairs = 0;
  for (let i = 0; i < correctOrder.length; i += 1) {
    for (let j = i + 1; j < correctOrder.length; j += 1) {
      const first = correctOrder[i];
      const second = correctOrder[j];
      const posFirst = providedIndex.get(first);
      const posSecond = providedIndex.get(second);
      if (posFirst === undefined || posSecond === undefined) {
        continue;
      }
      if (posFirst < posSecond) {
        correctPairs += 1;
      }
    }
  }
  return { score: correctPairs, maxScore };
}
