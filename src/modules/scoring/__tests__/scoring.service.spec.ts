import { describe, expect, it } from 'vitest';
import {
  scoreDragDropItem,
  scoreFillBlankItem,
  scoreHotspotItem,
  scoreMatchingItem,
  scoreMcqItem,
  scoreNumericEntryItem,
  scoreOrderingItem,
  scoreTrueFalseItem,
  simpleMcqScore,
} from '../scoring.service.js';
import type {
  ChoiceItem,
  DragDropItem,
  FillBlankItem,
  HotspotItem,
  MatchingItem,
  NumericEntryItem,
  OrderingItem,
} from '../../../common/types.js';

describe('scoreMcqItem', () => {
  const baseMcq: ChoiceItem = {
    id: 'mcq-1',
    tenantId: 't1',
    kind: 'MCQ',
    prompt: '2+2?',
    choices: [{ text: '3' }, { text: '4' }],
    answerMode: 'single',
    correctIndexes: [1],
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('scores single correct answer', () => {
    expect(scoreMcqItem(baseMcq, [1])).toEqual({ score: 1, maxScore: 1 });
    expect(scoreMcqItem(baseMcq, [0])).toEqual({ score: 0, maxScore: 1 });
  });

  it('scores multiple correct answers', () => {
    const multiMcq: ChoiceItem = { ...baseMcq, answerMode: 'multiple', correctIndexes: [0, 1] };
    expect(scoreMcqItem(multiMcq, [0, 1])).toEqual({ score: 1, maxScore: 1 });
    expect(scoreMcqItem(multiMcq, [1, 0])).toEqual({ score: 1, maxScore: 1 });
    expect(scoreMcqItem(multiMcq, [0])).toEqual({ score: 0, maxScore: 1 });
  });
});

describe('scoreTrueFalseItem', () => {
  const baseTf: ChoiceItem = {
    id: 'tf-1',
    tenantId: 't1',
    kind: 'TRUE_FALSE',
    prompt: 'Sky is blue',
    choices: [{ text: 'True' }, { text: 'False' }],
    answerMode: 'single',
    correctIndexes: [0],
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('scores correct answer', () => {
    expect(scoreTrueFalseItem(baseTf, [0])).toEqual({ score: 1, maxScore: 1 });
    expect(scoreTrueFalseItem(baseTf, [1])).toEqual({ score: 0, maxScore: 1 });
  });
});

describe('scoreFillBlankItem', () => {
  const baseFillBlank: FillBlankItem = {
    id: 'fb-1',
    tenantId: 't1',
    kind: 'FILL_IN_THE_BLANK',
    prompt: 'The [blank] is blue',
    blanks: [
      {
        id: 'b1',
        acceptableAnswers: [
          { type: 'exact', value: 'sky', caseSensitive: false },
          { type: 'regex', pattern: '^ocean$', flags: 'i' },
        ],
      },
    ],
    scoring: { mode: 'all' },
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('scores exact match (case insensitive)', () => {
    expect(scoreFillBlankItem(baseFillBlank, ['SKY'])).toEqual({ score: 1, maxScore: 1 });
    expect(scoreFillBlankItem(baseFillBlank, ['sky'])).toEqual({ score: 1, maxScore: 1 });
  });

  it('scores regex match', () => {
    expect(scoreFillBlankItem(baseFillBlank, ['ocean'])).toEqual({ score: 1, maxScore: 1 });
  });

  it('supports partial credit', () => {
    const multiBlank: FillBlankItem = {
      ...baseFillBlank,
      blanks: [
        ...baseFillBlank.blanks,
        { id: 'b2', acceptableAnswers: [{ type: 'exact', value: 'deep', caseSensitive: false }] },
      ],
      scoring: { mode: 'partial' },
    };
    expect(scoreFillBlankItem(multiBlank, ['sky', 'deep'])).toEqual({ score: 2, maxScore: 2 });
    expect(scoreFillBlankItem(multiBlank, ['sky', 'shallow'])).toEqual({ score: 1, maxScore: 2 });
  });
});

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

describe('scoreNumericEntryItem', () => {
  const baseNumericItem: NumericEntryItem = {
    id: 'num-1',
    tenantId: 'tenant',
    kind: 'NUMERIC_ENTRY',
    prompt: 'What is 2+2?',
    validation: { mode: 'exact', value: 4, tolerance: 0.1 },
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('awards credit for exact match within tolerance', () => {
    expect(scoreNumericEntryItem(baseNumericItem, { value: 4 })).toEqual({ score: 1, maxScore: 1 });
    expect(scoreNumericEntryItem(baseNumericItem, { value: 4.05 })).toEqual({ score: 1, maxScore: 1 });
    expect(scoreNumericEntryItem(baseNumericItem, { value: 4.2 })).toEqual({ score: 0, maxScore: 1 });
  });

  it('awards credit for range match', () => {
    const rangeItem: NumericEntryItem = {
      ...baseNumericItem,
      validation: { mode: 'range', min: 10, max: 20 },
    };
    expect(scoreNumericEntryItem(rangeItem, { value: 15 })).toEqual({ score: 1, maxScore: 1 });
    expect(scoreNumericEntryItem(rangeItem, { value: 10 })).toEqual({ score: 1, maxScore: 1 });
    expect(scoreNumericEntryItem(rangeItem, { value: 25 })).toEqual({ score: 0, maxScore: 1 });
  });
});

describe('scoreHotspotItem', () => {
  const baseHotspotItem: HotspotItem = {
    id: 'hot-1',
    tenantId: 'tenant',
    kind: 'HOTSPOT',
    prompt: 'Click the square',
    image: { url: 'http://example.com/img.png', width: 100, height: 100 },
    hotspots: [
      {
        id: 'square',
        points: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0 },
          { x: 0.5, y: 0.5 },
          { x: 0, y: 0.5 },
        ],
      },
    ],
    scoring: { mode: 'all' },
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('awards credit when point is inside polygon', () => {
    expect(scoreHotspotItem(baseHotspotItem, [{ x: 0.25, y: 0.25 }])).toEqual({ score: 1, maxScore: 1 });
  });

  it('denies credit when point is outside polygon', () => {
    expect(scoreHotspotItem(baseHotspotItem, [{ x: 0.75, y: 0.75 }])).toEqual({ score: 0, maxScore: 1 });
  });

  it('supports partial credit for multiple hotspots', () => {
    const multiHotspotItem: HotspotItem = {
      ...baseHotspotItem,
      hotspots: [
        ...baseHotspotItem.hotspots,
        {
          id: 'circle',
          points: [
            { x: 0.6, y: 0.6 },
            { x: 0.9, y: 0.6 },
            { x: 0.9, y: 0.9 },
            { x: 0.6, y: 0.9 },
          ],
        },
      ],
      scoring: { mode: 'partial' },
    };
    expect(scoreHotspotItem(multiHotspotItem, [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }])).toEqual({
      score: 2,
      maxScore: 2,
    });
    expect(scoreHotspotItem(multiHotspotItem, [{ x: 0.25, y: 0.25 }, { x: 0.1, y: 0.1 }])).toEqual({
      score: 1,
      maxScore: 2,
    });
  });
});

describe('scoreDragDropItem', () => {
  const baseDragDropItem: DragDropItem = {
    id: 'dd-1',
    tenantId: 'tenant',
    kind: 'DRAG_AND_DROP',
    prompt: 'Sort items',
    tokens: [
      { id: 't1', label: 'Token 1' },
      { id: 't2', label: 'Token 2' },
    ],
    zones: [
      { id: 'z1', label: 'Zone 1', correctTokenIds: ['t1'] },
      { id: 'z2', label: 'Zone 2', correctTokenIds: ['t2'] },
    ],
    scoring: { mode: 'all' },
    createdAt: 'now',
    updatedAt: 'now',
  };

  it('awards credit when all tokens are in correct zones', () => {
    const answers = [
      { tokenId: 't1', dropZoneId: 'z1' },
      { tokenId: 't2', dropZoneId: 'z2' },
    ];
    expect(scoreDragDropItem(baseDragDropItem, answers)).toEqual({ score: 1, maxScore: 1 });
  });

  it('supports per-zone scoring', () => {
    const perZoneItem: DragDropItem = { ...baseDragDropItem, scoring: { mode: 'per_zone' } };
    const answers = [{ tokenId: 't1', dropZoneId: 'z1' }];
    expect(scoreDragDropItem(perZoneItem, answers)).toEqual({ score: 1, maxScore: 2 });
  });

  it('supports per-token scoring', () => {
    const perTokenItem: DragDropItem = { ...baseDragDropItem, scoring: { mode: 'per_token' } };
    const answers = [{ tokenId: 't1', dropZoneId: 'z1' }];
    expect(scoreDragDropItem(perTokenItem, answers)).toEqual({ score: 1, maxScore: 2 });
  });

  it('handles ordered zones', () => {
    const orderedItem: DragDropItem = {
      ...baseDragDropItem,
      zones: [{ id: 'z1', label: 'Zone 1', correctTokenIds: ['t1', 't2'], evaluation: 'ordered' }],
      scoring: { mode: 'all' },
    };
    const correct = [
      { tokenId: 't1', dropZoneId: 'z1', position: 0 },
      { tokenId: 't2', dropZoneId: 'z1', position: 1 },
    ];
    expect(scoreDragDropItem(orderedItem, correct)).toEqual({ score: 1, maxScore: 1 });

    const incorrect = [
      { tokenId: 't2', dropZoneId: 'z1', position: 0 },
      { tokenId: 't1', dropZoneId: 'z1', position: 1 },
    ];
    expect(scoreDragDropItem(orderedItem, incorrect)).toEqual({ score: 0, maxScore: 1 });
  });
});
