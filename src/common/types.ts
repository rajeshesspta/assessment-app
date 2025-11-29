export interface TenantScoped { tenantId: string; }

export interface BaseEntity extends TenantScoped { id: string; createdAt: string; updatedAt: string; }

export type MCQChoice = { text: string };

export type ItemAnswerMode = 'single' | 'multiple';

export type ItemKind = 'MCQ' | 'TRUE_FALSE';

export interface Item extends BaseEntity {
	kind: ItemKind;
	prompt: string;
	choices: MCQChoice[];
	answerMode: ItemAnswerMode;
	correctIndexes: number[];
}

export interface Assessment extends BaseEntity { title: string; itemIds: string[]; }

export interface AttemptResponse { itemId: string; answerIndexes?: number[]; }

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
