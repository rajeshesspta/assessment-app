export interface TenantScoped { tenantId: string; }

export interface BaseEntity extends TenantScoped { id: string; createdAt: string; updatedAt: string; }

export type MCQChoice = { text: string };

export type ItemAnswerMode = 'single' | 'multiple';

export type ItemKind = 'MCQ' | 'TRUE_FALSE' | 'FILL_IN_THE_BLANK' | 'MATCHING' | 'ORDERING' | 'SHORT_ANSWER' | 'ESSAY' | 'NUMERIC_ENTRY';

export interface BaseItemEntity extends BaseEntity {
	kind: ItemKind;
	prompt: string;
}

export interface ChoiceItem extends BaseItemEntity {
	kind: 'MCQ' | 'TRUE_FALSE';
	choices: MCQChoice[];
	answerMode: ItemAnswerMode;
	correctIndexes: number[];
}

export type FillBlankMatcher =
	| { type: 'exact'; value: string; caseSensitive?: boolean }
	| { type: 'regex'; pattern: string; flags?: string };

export interface FillBlankDefinition {
	id: string;
	acceptableAnswers: FillBlankMatcher[];
}

export interface FillBlankScoringRule {
	mode: 'all' | 'partial';
}

export interface FillBlankItem extends BaseItemEntity {
	kind: 'FILL_IN_THE_BLANK';
	blanks: FillBlankDefinition[];
	scoring: FillBlankScoringRule;
}

export interface MatchingTarget { id: string; text: string; }

export interface MatchingPromptDefinition { id: string; text: string; correctTargetId: string; }

export interface MatchingScoringRule { mode: 'all' | 'partial'; }

export interface MatchingItem extends BaseItemEntity {
	kind: 'MATCHING';
	prompts: MatchingPromptDefinition[];
	targets: MatchingTarget[];
	scoring: MatchingScoringRule;
}

export interface OrderingOption { id: string; text: string; }

export interface OrderingScoringRule {
	mode: 'all' | 'partial_pairs';
	customEvaluatorId?: string;
}

export interface OrderingItem extends BaseItemEntity {
	kind: 'ORDERING';
	options: OrderingOption[];
	correctOrder: string[];
	scoring: OrderingScoringRule;
}

export interface ShortAnswerRubric {
	keywords?: string[];
	guidance?: string;
}

export interface ShortAnswerScoringRule {
	mode: 'manual' | 'ai_rubric';
	maxScore: number;
	aiEvaluatorId?: string;
}

export interface ShortAnswerItem extends BaseItemEntity {
	kind: 'SHORT_ANSWER';
	rubric?: ShortAnswerRubric;
	scoring: ShortAnswerScoringRule;
}

export interface EssayLengthExpectation {
	minWords?: number;
	maxWords?: number;
	recommendedWords?: number;
}

export interface EssayRubricSection {
	id: string;
	title: string;
	description?: string;
	maxScore: number;
	keywords?: string[];
}

export interface EssayRubric extends ShortAnswerRubric {
	sections?: EssayRubricSection[];
}

export interface EssayScoringRule {
	mode: 'manual' | 'ai_rubric';
	maxScore: number;
	aiEvaluatorId?: string;
}

export interface EssayItem extends BaseItemEntity {
	kind: 'ESSAY';
	rubric?: EssayRubric;
	length?: EssayLengthExpectation;
	scoring: EssayScoringRule;
}

export interface NumericUnitsMetadata {
	label?: string;
	symbol?: string;
	precision?: number;
}

export type NumericValidationRule =
	| { mode: 'exact'; value: number; tolerance?: number }
	| { mode: 'range'; min: number; max: number };

export interface NumericEntryItem extends BaseItemEntity {
	kind: 'NUMERIC_ENTRY';
	validation: NumericValidationRule;
	units?: NumericUnitsMetadata;
}

export type Item = ChoiceItem | FillBlankItem | MatchingItem | OrderingItem | ShortAnswerItem | EssayItem | NumericEntryItem;

export interface Assessment extends BaseEntity { title: string; itemIds: string[]; }

export interface AttemptResponse {
	itemId: string;
	answerIndexes?: number[];
	textAnswers?: string[];
	matchingAnswers?: { promptId: string; targetId: string }[];
	orderingAnswer?: string[];
	essayAnswer?: string;
	numericAnswer?: { value: number; unit?: string };
}

export interface Attempt extends BaseEntity { assessmentId: string; userId: string; status: 'in_progress' | 'submitted' | 'scored'; responses: AttemptResponse[]; score?: number; maxScore?: number; }

export interface DomainEvent<TPayload = any> { id: string; type: string; occurredAt: string; tenantId: string; payload: TPayload; }

export interface TenantRateLimit { requestsPerMinute: number; burst?: number; }

export interface Tenant {
	id: string;
	name: string;
	slug: string;
	status: 'active' | 'inactive';
	contactEmail?: string;
	apiKey: string;
	rateLimit: TenantRateLimit;
	persistence: { provider: 'sqlite' | 'memory' | 'cosmos' };
	metadata?: Record<string, string>;
	createdAt: string;
	updatedAt: string;
}
