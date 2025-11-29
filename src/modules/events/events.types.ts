// Event type constants for stronger typing later
export const EVENT_TYPES = {
  ItemCreated: 'ItemCreated',
  AssessmentCreated: 'AssessmentCreated',
  AttemptStarted: 'AttemptStarted',
  AttemptScored: 'AttemptScored',
  FreeResponseEvaluationRequested: 'FreeResponseEvaluationRequested',
  ScenarioEvaluationRequested: 'ScenarioEvaluationRequested'
} as const;
