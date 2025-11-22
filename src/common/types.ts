export interface TenantScoped { tenantId: string; }

export interface BaseEntity extends TenantScoped { id: string; createdAt: string; updatedAt: string; }

export type MCQChoice = { text: string };

export interface Item extends BaseEntity { kind: 'MCQ'; prompt: string; choices: MCQChoice[]; correctIndex: number; }

export interface Assessment extends BaseEntity { title: string; itemIds: string[]; }

export interface AttemptResponse { itemId: string; answerIndex?: number; }

export interface Attempt extends BaseEntity { assessmentId: string; userId: string; status: 'in_progress' | 'submitted' | 'scored'; responses: AttemptResponse[]; score?: number; maxScore?: number; }

export interface DomainEvent<TPayload = any> { id: string; type: string; occurredAt: string; tenantId: string; payload: TPayload; }
