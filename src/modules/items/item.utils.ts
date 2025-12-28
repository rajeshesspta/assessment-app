import type { Item } from '../../common/types.js';

export function sanitizeItemForLearner(item: Item): any {
  const { ...sanitized } = item as any;

  // Remove correct answers based on item kind
  switch (item.kind) {
    case 'MCQ':
    case 'TRUE_FALSE':
      delete sanitized.correctIndexes;
      break;
    case 'FILL_IN_THE_BLANK':
      sanitized.blanks = item.blanks.map(blank => {
        const { acceptableAnswers, ...rest } = blank;
        return rest;
      });
      break;
    case 'MATCHING':
      sanitized.prompts = item.prompts.map(prompt => {
        const { correctTargetId, ...rest } = prompt;
        return rest;
      });
      break;
    case 'ORDERING':
      delete sanitized.correctOrder;
      break;
    case 'SHORT_ANSWER':
    case 'ESSAY':
      if (sanitized.rubric) {
        const { keywords, sampleAnswer, ...rest } = sanitized.rubric;
        sanitized.rubric = rest;
        if (item.kind === 'ESSAY' && item.rubric?.sections) {
          sanitized.rubric!.sections = item.rubric.sections.map((section: any) => {
            const { keywords, ...sectionRest } = section;
            return sectionRest;
          });
        }
      }
      break;
    case 'NUMERIC_ENTRY':
      delete sanitized.validation;
      break;
    case 'HOTSPOT':
      // For hotspots, we might want to keep the regions if they are used for UI (e.g. highlighting areas to click)
      // but we should remove any indication of which ones are "correct" if that's stored there.
      // In our current model, all hotspots in the list are the "correct" ones.
      // So we should probably remove them or at least their coordinates if they shouldn't be known.
      delete sanitized.hotspots;
      break;
    case 'DRAG_AND_DROP':
      sanitized.zones = item.zones.map(zone => {
        const { correctTokenIds, ...rest } = zone;
        return rest;
      });
      break;
    case 'SCENARIO_TASK':
      delete sanitized.scoring;
      break;
  }

  return sanitized;
}
