import { describe, expect, it } from 'vitest';
import { simpleMcqScore } from '../scoring.service.js';

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
