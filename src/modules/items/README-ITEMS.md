# Items Module Notes

Item banks are tenant-scoped. Any Content Author inside the same tenant can reuse the shared items listed here, but items are never visible to authors in other tenants unless they explicitly export/import definitions.

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

// Short-answer / Free response (auto-scoring deferred; events drive manual or AI rubric review)
{
	"kind": "SHORT_ANSWER",
	"prompt": "Explain why seasons change throughout the year.",
	"rubric": {
		"keywords": ["tilt", "axis", "orbit"],
		"guidance": "Mention Earth's axial tilt and its orbit around the sun."
	},
	"scoring": {
		"mode": "manual",
		"maxScore": 3
	}
}

// Essay / Long form (captures length expectations + rubric sections)
{
	"kind": "ESSAY",
	"prompt": "Discuss the long-term impacts of industrialization on urban planning.",
	"length": {
		"minWords": 250,
		"maxWords": 600,
		"recommendedWords": 400
	},
	"rubric": {
		"guidance": "Address infrastructure, social change, and sustainability.",
		"sections": [
			{ "id": "structure", "title": "Structure", "maxScore": 3 },
			{ "id": "analysis", "title": "Analysis", "maxScore": 4 },
			{ "id": "evidence", "title": "Evidence", "maxScore": 3 }
		]
	},
	"scoring": {
		"mode": "manual",
		"maxScore": 10
	}
}

// Numeric entry (auto-scored via range or exact-with-tolerance rules)
{
	"kind": "NUMERIC_ENTRY",
	"prompt": "Report the circuit voltage in volts.",
	"validation": { "mode": "exact", "value": 12.5, "tolerance": 0.1 },
	"units": { "label": "Volts", "symbol": "V", "precision": 2 }
}

// Hotspot / image region (clients click coordinates that must land inside known polygons)
{
	"kind": "HOTSPOT",
	"prompt": "Identify the highlighted regions on the map.",
	"image": {
		"url": "https://example.com/world.png",
		"width": 1200,
		"height": 675,
		"alt": "World map outline"
	},
	"hotspots": [
		{
			"id": "region-a",
			"label": "Region A",
			"points": [
				{ "x": 0.12, "y": 0.18 },
				{ "x": 0.28, "y": 0.2 },
				{ "x": 0.2, "y": 0.32 }
			]
		}
	],
	"scoring": { "mode": "partial", "maxSelections": 2 }
}

// Drag-and-drop (tokens placed onto drop zones; supports classification or ordered sequences)
{
	"kind": "DRAG_AND_DROP",
	"prompt": "Drag each label onto the correct diagram.",
	"tokens": [
		{ "id": "tok-heart", "label": "Heart", "category": "circulatory" },
		{ "id": "tok-lungs", "label": "Lungs", "category": "respiratory" }
	],
	"zones": [
		{
			"id": "zone-cardiac",
			"label": "Circulatory",
			"acceptsCategories": ["circulatory"],
			"correctTokenIds": ["tok-heart"],
			"evaluation": "set",
			"maxTokens": 2
		},
		{
			"id": "zone-respiratory",
			"label": "Respiratory",
			"acceptsCategories": ["respiratory"],
			"correctTokenIds": ["tok-lungs"],
			"evaluation": "set"
		}
	],
	"scoring": { "mode": "per_zone" }
}

// Scenario / coding task (attachments + workspace metadata, evaluated manually or via automation)
{
	"kind": "SCENARIO_TASK",
	"prompt": "Stabilize the checkout pipeline",
	"brief": "Investigate flaky payments, land a fix, and document the rollout plan.",
	"attachments": [
		{ "id": "spec", "label": "Design brief", "url": "https://example.com/checkout.pdf", "kind": "reference" },
		{ "id": "starter", "label": "Starter repo", "url": "https://github.com/example/checkout-starter", "kind": "starter" }
	],
	"workspace": {
		"templateRepositoryUrl": "https://github.com/example/checkout-template",
		"branch": "main",
		"instructions": ["npm install", "npm run verify"]
	},
	"evaluation": {
		"mode": "automated",
		"automationServiceId": "azure-devcenter",
		"runtime": "node20",
		"entryPoint": "npm test",
		"timeoutSeconds": 900,
		"testCases": [
			{ "id": "lint" },
			{ "id": "unit", "weight": 2 }
		]
	},
	"scoring": {
		"maxScore": 25,
		"rubric": [
			{ "id": "correctness", "description": "Automation suite passes", "weight": 20 },
			{ "id": "quality", "description": "Readable commits & docs", "weight": 5 }
		]
	}
}
```

TRUE_FALSE items are persisted as single-answer MCQs with canonical choices, which keeps downstream scoring logic untouched.

Fill-in-the-blank items define one or more blanks, each with acceptable answers (exact or regex). Attempts submit `textAnswers` for those blanks in order; multi-blank items can use `scoring.mode = "partial"` to award credit per blank or `"all"` to require every blank to match.

Matching items persist their prompt/target schema inside `matching_schema_json`. Attempts provide `matchingAnswers` shaped as `{ promptId, targetId }[]`; scoring awards either per-prompt (partial) or requires a perfect set (all).

Ordering items persist their schema inside `ordering_schema_json` and expect clients to submit `orderingAnswer` arrays preserving the option ids. Built-in scoring supports binary (`mode: "all"`) or pairwise partial credit (`"partial_pairs"`, Kendall-tau style). Set `scoring.customEvaluatorId` to a known handler name when delegating scoring to an external service—built-in scoring will skip those items but they still contribute to `maxScore`.

Short-answer items store their rubric + scoring metadata inside `short_answer_schema_json`. Attempts simply provide `textAnswer`/`textAnswers[0]`. When an attempt is submitted, the API records `maxScore`, keeps the attempt in `submitted` status, and publishes a `FreeResponseEvaluationRequested` event (containing prompt, rubric keywords, and response text) so a manual reviewer or AI evaluator can award the final score.

Essay items persist their metadata inside `essay_schema_json`, including optional rubric sections and length expectations (min/max/recommended word counts). Attempts send `essayAnswer` strings; submission triggers the same deferred-scoring workflow, emitting a `FreeResponseEvaluationRequested` event that contains rubric sections, keywords, and length guidance for downstream graders.

Numeric entry items persist validation + units metadata in `numeric_schema_json`. Validation supports two modes: `exact` (value plus optional absolute `tolerance`) and `range` (inclusive `min`/`max`). Units metadata is optional but can expose UI hints such as `label`, `symbol`, or preferred decimal `precision`. Attempts submit `numericAnswer.value` (and optionally `numericAnswer.unit`) and are auto-scored immediately during submission.

Hotspot items persist their image metadata, region polygons, and scoring rules inside `hotspot_schema_json`. Points are normalized to the `[0, 1]` coordinate space relative to the background image dimensions, which keeps scoring resolution independent of pixel density. Attempts submit `hotspotAnswers` arrays containing normalized `{ x, y }` coordinates. During submission, the API counts how many clicks land inside the configured polygons: `scoring.mode = "all"` requires every hotspot to be identified (awarding a single point), whereas `mode = "partial"` awards up to `maxSelections` points—one per correctly identified region.

Drag-and-drop items persist their token metadata, drop zones, and scoring rules inside `drag_drop_schema_json`. Each token has a stable id plus optional category tags; zones can restrict acceptable tokens via explicit ids or categories, set `maxTokens`, and opt into `evaluation: "set"` (unordered classification) or `"ordered"` (sequencing). Attempts submit `dragDropAnswers` entries shaped as `{ tokenId, dropZoneId, position? }`, where `position` is only needed for ordered zones. Scoring supports three modes: `all` (one point when every zone is satisfied), `per_zone` (one point per correct zone), or `per_token` (fine-grained partial credit per correctly placed/ordered token).

Scenario task items persist their workspace + evaluation metadata inside `scenario_schema_json`. The schema captures attachments (reference docs, starter repos, datasets), workspace bootstrapping instructions, and either manual or automated evaluation directives. Attempts submit `scenarioAnswer` payloads containing repository and artifact URLs, optional submission notes, and supporting files. Submissions always remain in `submitted` status until downstream automation or reviewers finish processing a `ScenarioEvaluationRequested` event, at which point score + status can be finalized.

`GET /items` supports optional query params: `search` (full-text on prompts) and `kind`, enabling callers to fetch only a specific item type.

## Partition Strategy (future Cosmos)

Use `/tenantId#subject` or `/tenantId#tag` to distribute read/write load evenly.

Large media stored separately in blob storage referenced by item document.
