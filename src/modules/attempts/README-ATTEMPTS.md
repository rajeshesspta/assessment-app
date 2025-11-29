# Attempts Module Notes

Partition key candidates: /tenantId#assessmentId#userId or shard bucket for high concurrency.
Responses may embed if total size < 2MB else split into container keyed by attemptId. Short-answer and essay items keep attempts in `submitted` status and require external evaluators (manual or AI rubric) to publish scores after consuming the `FreeResponseEvaluationRequested` events. Numeric entry responses use `numericAnswer.value` (with optional `unit`) and are auto-evaluated server-side using either exact-with-tolerance or range validation rules defined on the item.
