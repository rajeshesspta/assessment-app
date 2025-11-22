// Placeholder for future complex scoring strategies (rubrics, partial credit, adaptive)
export interface ScoringResult { score: number; maxScore: number; }

export function simpleMcqScore(correct: number, total: number): ScoringResult {
  return { score: correct, maxScore: total };
}
