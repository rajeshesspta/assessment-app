// Placeholder for future complex scoring strategies (rubrics, partial credit, adaptive)
import type {
  AttemptResponse,
  ChoiceItem,
  DragDropItem,
  FillBlankItem,
  FillBlankMatcher,
  HotspotItem,
  HotspotPoint,
  MatchingItem,
  NumericEntryItem,
  OrderingItem,
} from '../../common/types.js';

export interface ScoringResult { score: number; maxScore: number; }

export function simpleMcqScore(correct: number, total: number): ScoringResult {
  return { score: correct, maxScore: total };
}

export function scoreMcqItem(item: ChoiceItem, answer?: AttemptResponse['answerIndexes']): ScoringResult {
  const maxScore = 1;
  const correct = new Set(item.correctIndexes);
  const answers = answer ? Array.from(new Set(answer)).sort((a, b) => (a as number) - (b as number)) : [];
  const expected = Array.from(correct).sort((a, b) => (a as number) - (b as number));

  if (item.answerMode === 'single') {
    const isCorrect = answers.length === 1 && answers[0] === expected[0];
    return { score: isCorrect ? 1 : 0, maxScore };
  }

  const isCorrect = answers.length === expected.length && expected.every((value, idx) => value === answers[idx]);
  return { score: isCorrect ? 1 : 0, maxScore };
}

export function scoreTrueFalseItem(item: ChoiceItem, answer?: AttemptResponse['answerIndexes']): ScoringResult {
  const maxScore = 1;
  const isCorrect = answer?.length === 1 && answer[0] === item.correctIndexes[0];
  return { score: isCorrect ? 1 : 0, maxScore };
}

function matchesFillBlankAnswer(value: string, matcher: FillBlankMatcher): boolean {
  if (matcher.type === 'exact') {
    if (matcher.caseSensitive) {
      return value === matcher.value;
    }
    return value.localeCompare(matcher.value, undefined, { sensitivity: 'accent' }) === 0;
  }
  try {
    const regex = new RegExp(matcher.pattern, matcher.flags ?? 'i');
    return regex.test(value);
  } catch {
    return false;
  }
}

export function scoreFillBlankItem(item: FillBlankItem, answers?: string[]): ScoringResult {
  const blanks = item.blanks ?? [];
  const provided = answers ?? [];
  const blanksCorrect = blanks.reduce((total, blank, index) => {
    const candidate = provided[index]?.trim();
    if (!candidate) {
      return total;
    }
    const isMatch = blank.acceptableAnswers.some(matcher => matchesFillBlankAnswer(candidate, matcher));
    return isMatch ? total + 1 : total;
  }, 0);

  if (item.scoring.mode === 'partial') {
    return { score: blanksCorrect, maxScore: blanks.length };
  }
  const allCorrect = blanksCorrect === blanks.length && blanks.length > 0;
  return { score: allCorrect ? 1 : 0, maxScore: 1 };
}

export function scoreNumericEntryItem(item: NumericEntryItem, answer?: AttemptResponse['numericAnswer']): ScoringResult {
  const maxScore = 1;
  const provided = answer?.value;
  if (typeof provided !== 'number' || !Number.isFinite(provided)) {
    return { score: 0, maxScore };
  }
  let isCorrect = false;
  if (item.validation.mode === 'exact') {
    const tolerance = item.validation.tolerance ?? 0;
    isCorrect = Math.abs(provided - item.validation.value) <= tolerance;
  } else {
    isCorrect = provided >= item.validation.min && provided <= item.validation.max;
  }
  return { score: isCorrect ? 1 : 0, maxScore };
}

function isPointInPolygon(point: HotspotPoint, polygon: HotspotPoint[]): boolean {
  if (!polygon || polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function scoreHotspotItem(item: HotspotItem, answers?: HotspotPoint[]): ScoringResult {
  const hotspotCount = item.hotspots.length;
  if (hotspotCount === 0) {
    return { score: 0, maxScore: 0 };
  }
  const selectionLimit = item.scoring.maxSelections ?? hotspotCount;
  const selectionBudget = Math.min(hotspotCount, Math.max(1, selectionLimit));
  const mode = item.scoring.mode ?? 'all';
  const maxScore = mode === 'partial' ? selectionBudget : 1;

  const provided = (answers ?? []).slice(0, selectionBudget);
  if (provided.length === 0) {
    return { score: 0, maxScore };
  }

  const matched = new Set<string>();
  for (const answer of provided) {
    const region = item.hotspots.find(hotspot => isPointInPolygon(answer, hotspot.points));
    if (region) {
      matched.add(region.id);
    }
  }

  if (mode === 'partial') {
    return { score: matched.size, maxScore };
  }
  const allCorrect = matched.size === hotspotCount && hotspotCount > 0;
  return { score: allCorrect ? 1 : 0, maxScore };
}

export function scoreDragDropItem(item: DragDropItem, answers?: AttemptResponse['dragDropAnswers']): ScoringResult {
  const zones = item.zones ?? [];
  if (zones.length === 0) {
    return { score: 0, maxScore: 0 };
  }
  const totalTokenCredit = zones.reduce((total, zone) => total + zone.correctTokenIds.length, 0);
  const mode = item.scoring.mode ?? 'all';
  let maxScore = 1;
  if (mode === 'per_zone') {
    maxScore = zones.length;
  } else if (mode === 'per_token') {
    maxScore = totalTokenCredit;
  }

  const provided = answers ?? [];
  if (provided.length === 0) {
    return { score: 0, maxScore };
  }

  const zoneIds = new Set(zones.map(zone => zone.id));
  const allowedTokenIds = new Set(item.tokens.map(token => token.id));
  const placementsByZone = new Map<string, { tokenId: string; position?: number }[]>();
  for (const placement of provided) {
    if (!zoneIds.has(placement.dropZoneId) || !allowedTokenIds.has(placement.tokenId)) {
      continue;
    }
    const list = placementsByZone.get(placement.dropZoneId) ?? [];
    list.push({ tokenId: placement.tokenId, position: placement.position });
    placementsByZone.set(placement.dropZoneId, list);
  }

  let correctZoneCount = 0;
  let correctTokenCount = 0;
  for (const zone of zones) {
    const placements = placementsByZone.get(zone.id) ?? [];
    const sortedPlacements = zone.evaluation === 'ordered'
      ? placements
          .slice()
          .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
      : placements;
    const limitedPlacements = zone.maxTokens
      ? sortedPlacements.slice(0, zone.maxTokens)
      : sortedPlacements;

    if (zone.evaluation === 'ordered') {
      const providedOrder = limitedPlacements.map(p => p.tokenId);
      const expected = zone.correctTokenIds;
      const isZoneCorrect = providedOrder.length === expected.length
        && expected.every((tokenId, index) => tokenId === providedOrder[index]);
      if (isZoneCorrect) {
        correctZoneCount += 1;
        correctTokenCount += expected.length;
      } else if (mode === 'per_token') {
        for (let i = 0; i < expected.length && i < providedOrder.length; i += 1) {
          if (providedOrder[i] === expected[i]) {
            correctTokenCount += 1;
          }
        }
      }
      continue;
    }

    const providedSet = new Set(limitedPlacements.map(p => p.tokenId));
    const expectedSet = new Set(zone.correctTokenIds);
    const missing = zone.correctTokenIds.find(tokenId => !providedSet.has(tokenId));
    const extra = providedSet.size > expectedSet.size
      ? Array.from(providedSet).find(tokenId => !expectedSet.has(tokenId))
      : undefined;

    if (!missing && !extra && expectedSet.size === providedSet.size) {
      correctZoneCount += 1;
    }
    if (mode === 'per_token') {
      for (const tokenId of zone.correctTokenIds) {
        if (providedSet.has(tokenId)) {
          correctTokenCount += 1;
        }
      }
    }
  }

  if (mode === 'all') {
    const isCorrect = correctZoneCount === zones.length && zones.length > 0;
    return { score: isCorrect ? 1 : 0, maxScore };
  }
  if (mode === 'per_zone') {
    return { score: correctZoneCount, maxScore };
  }
  return { score: correctTokenCount, maxScore };
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
