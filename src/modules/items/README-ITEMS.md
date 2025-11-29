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
```

TRUE_FALSE items are persisted as single-answer MCQs with canonical choices, which keeps downstream scoring logic untouched.

## Partition Strategy (future Cosmos)

Use `/tenantId#subject` or `/tenantId#tag` to distribute read/write load evenly.

Large media stored separately in blob storage referenced by item document.
