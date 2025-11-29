# Items Module Notes

## API payloads

`POST /items` accepts a discriminated payload:

```jsonc
// Multiple-choice (default when kind omitted for backwards compatibility)
{
	"kind": "MCQ",
	"prompt": "Select the vowels",
	"choices": [
		{ "text": "A" },
		{ "text": "B" },
		{ "text": "E" }
	],
	"answerMode": "multiple",
	"correctIndexes": [0, 2]
}

// True/False (choices auto-derived as "True"/"False")
{
	"kind": "TRUE_FALSE",
	"prompt": "The sky is blue.",
	"answerIsTrue": true
}

// Fill-in-the-blank (single blank with exact + regex answers)
{
	"kind": "FILL_IN_THE_BLANK",
	"prompt": "___ is the chemical symbol for water.",
	"blanks": [
		{
			"id": "blank-1",
			"answers": [
				{ "type": "exact", "value": "H2O", "caseSensitive": false },
				{ "type": "regex", "pattern": "^h\\s*2\\s*o$", "flags": "i" }
			]
		}
	],
	"scoring": { "mode": "all" }
}

// Matching (pair prompts with available targets; answers stored per prompt)
{
	"kind": "MATCHING",
	"prompt": "Match the country to its capital",
	"prompts": [
		{ "id": "p-fr", "text": "France", "correctTargetId": "t-paris" },
		{ "id": "p-de", "text": "Germany", "correctTargetId": "t-berlin" }
	],
	"targets": [
		{ "id": "t-paris", "text": "Paris" },
		{ "id": "t-berlin", "text": "Berlin" },
		{ "id": "t-madrid", "text": "Madrid" }
	],
	"scoring": { "mode": "partial" }
}

// Ordering / Ranking (clients submit orderingAnswer as an array of option ids)
{
	"kind": "ORDERING",
	"prompt": "Rank the software lifecycle stages",
	"options": [
		{ "id": "opt-plan", "text": "Plan" },
		{ "id": "opt-build", "text": "Build" },
		{ "id": "opt-test", "text": "Test" }
	],
	"correctOrder": ["opt-plan", "opt-build", "opt-test"],
	"scoring": { "mode": "partial_pairs", "customEvaluatorId": null }
}
```

TRUE_FALSE items are persisted as single-answer MCQs with canonical choices, which keeps downstream scoring logic untouched.

Fill-in-the-blank items define one or more blanks, each with acceptable answers (exact or regex). Attempts submit `textAnswers` for those blanks in order; multi-blank items can use `scoring.mode = "partial"` to award credit per blank or `"all"` to require every blank to match.

Matching items persist their prompt/target schema inside `matching_schema_json`. Attempts provide `matchingAnswers` shaped as `{ promptId, targetId }[]`; scoring awards either per-prompt (partial) or requires a perfect set (all).

Ordering items persist their schema inside `ordering_schema_json` and expect clients to submit `orderingAnswer` arrays preserving the option ids. Built-in scoring supports binary (`mode: "all"`) or pairwise partial credit (`"partial_pairs"`, Kendall-tau style). Set `scoring.customEvaluatorId` to a known handler name when delegating scoring to an external service—built-in scoring will skip those items but they still contribute to `maxScore`.

`GET /items` supports optional query params: `search` (full-text on prompts) and `kind`, enabling callers to fetch only a specific item type.

## Partition Strategy (future Cosmos)

Use `/tenantId#subject` or `/tenantId#tag` to distribute read/write load evenly.

Large media stored separately in blob storage referenced by item document.
