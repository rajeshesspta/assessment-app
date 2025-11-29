export interface TenantScoped { tenantId: string; }

export interface BaseEntity extends TenantScoped { id: string; createdAt: string; updatedAt: string; }

export type MCQChoice = { text: string };

export type ItemAnswerMode = 'single' | 'multiple';

export type ItemKind = 'MCQ' | 'TRUE_FALSE' | 'FILL_IN_THE_BLANK';

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

export type Item = ChoiceItem | FillBlankItem;

export interface Assessment extends BaseEntity { title: string; itemIds: string[]; }

export interface AttemptResponse { itemId: string; answerIndexes?: number[]; textAnswers?: string[]; }

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
