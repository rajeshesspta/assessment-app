import { describe, expect, it } from 'vitest';
import { scoreMatchingItem, scoreOrderingItem, simpleMcqScore } from '../scoring.service.js';
import type { MatchingItem, OrderingItem } from '../../../common/types.js';

describe('simpleMcqScore', () => {
  it('returns score and maxScore as provided', () => {
    expect(simpleMcqScore(3, 5)).toEqual({ score: 3, maxScore: 5 });
  });

  it('allows perfect scores', () => {
    expect(simpleMcqScore(5, 5)).toEqual({ score: 5, maxScore: 5 });
  });

  it('handles zero totals', () => {
    expect(simpleMcqScore(0, 0)).toEqual({ score: 0, maxScore: 0 });
  });
});

describe('scoreMatchingItem', () => {
  const baseMatchingItem: MatchingItem = {
    id: 'match-1',
    tenantId: 'tenant',
    kind: 'MATCHING',
    prompt: 'Match items',
    prompts: [
      { id: 'p-1', text: 'One', correctTargetId: 't-1' },
      { id: 'p-2', text: 'Two', correctTargetId: 't-2' },
    ],
    targets: [
      { id: 't-1', text: 'Alpha' },
      { id: 't-2', text: 'Beta' },
    ],
    scoring: { mode: 'partial' },
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('awards one point per correct prompt in partial mode', () => {
    const result = scoreMatchingItem(baseMatchingItem, [
      { promptId: 'p-1', targetId: 't-1' },
      { promptId: 'p-2', targetId: 't-2' },
    ]);
    expect(result).toEqual({ score: 2, maxScore: 2 });
  });

  it('returns binary credit when mode is all', () => {
    const result = scoreMatchingItem({ ...baseMatchingItem, scoring: { mode: 'all' } }, [
      { promptId: 'p-1', targetId: 't-1' },
    ]);
    expect(result).toEqual({ score: 0, maxScore: 1 });

    const perfect = scoreMatchingItem({ ...baseMatchingItem, scoring: { mode: 'all' } }, [
      { promptId: 'p-1', targetId: 't-1' },
      { promptId: 'p-2', targetId: 't-2' },
    ]);
    expect(perfect).toEqual({ score: 1, maxScore: 1 });
  });
});

describe('scoreOrderingItem', () => {
  const baseOrderingItem: OrderingItem = {
    id: 'order-1',
    tenantId: 'tenant',
    kind: 'ORDERING',
    prompt: 'Order steps',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ],
    correctOrder: ['a', 'b', 'c'],
    scoring: { mode: 'all' },
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('awards binary credit when all answers match', () => {
    const result = scoreOrderingItem(baseOrderingItem, ['a', 'b', 'c']);
    expect(result).toEqual({ score: 1, maxScore: 1 });

    const incorrect = scoreOrderingItem(baseOrderingItem, ['a', 'c', 'b']);
    expect(incorrect).toEqual({ score: 0, maxScore: 1 });
  });

  it('counts correct ordered pairs in partial_pairs mode', () => {
    const result = scoreOrderingItem({ ...baseOrderingItem, scoring: { mode: 'partial_pairs' } }, ['c', 'a', 'b']);
    // Only pair (a, b) remains in order; the other pairs are out of order or incomplete.
    expect(result).toEqual({ score: 1, maxScore: 3 });
  });

  it('returns zero score but preserves maxScore when using custom evaluator', () => {
    const result = scoreOrderingItem({ ...baseOrderingItem, scoring: { mode: 'all', customEvaluatorId: 'ai' } }, ['a', 'b', 'c']);
    expect(result).toEqual({ score: 0, maxScore: 1 });
  });
});
