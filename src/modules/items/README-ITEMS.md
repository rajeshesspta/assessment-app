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
```

TRUE_FALSE items are persisted as single-answer MCQs with canonical choices, which keeps downstream scoring logic untouched.

Fill-in-the-blank items define one or more blanks, each with acceptable answers (exact or regex). Attempts submit `textAnswers` for those blanks in order; multi-blank items can use `scoring.mode = "partial"` to award credit per blank or `"all"` to require every blank to match.

## Partition Strategy (future Cosmos)

Use `/tenantId#subject` or `/tenantId#tag` to distribute read/write load evenly.

Large media stored separately in blob storage referenced by item document.
