export interface TenantScoped { tenantId: string; }

export interface BaseEntity extends TenantScoped { id: string; createdAt: string; updatedAt: string; }

export const USER_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'CONTENT_AUTHOR', 'LEARNER', 'RATER'] as const;
export const TENANT_USER_ROLES = ['CONTENT_AUTHOR', 'LEARNER', 'RATER'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];

export type UserStatus = 'active' | 'invited' | 'disabled';

export interface User extends BaseEntity {
	roles: UserRole[];
	email: string;
	displayName?: string;
	status: UserStatus;
	createdBy?: string;
}

export type MCQChoice = { text: string };

export type ItemAnswerMode = 'single' | 'multiple';

export type ItemKind = 'MCQ' | 'TRUE_FALSE' | 'FILL_IN_THE_BLANK' | 'MATCHING' | 'ORDERING' | 'SHORT_ANSWER' | 'ESSAY' | 'NUMERIC_ENTRY' | 'HOTSPOT' | 'DRAG_AND_DROP' | 'SCENARIO_TASK';

export interface BaseItemEntity extends BaseEntity {
	kind: ItemKind;
	prompt: string;
	/**
	 * Category or categories for taxonomy grouping. Optional, can be string or array of strings.
	 */
	categories?: string[];
	/**
	 * Tags for flexible filtering. Optional, can be string or array of strings.
	 */
	tags?: string[];
	/**
	 * Arbitrary metadata for extensibility (e.g., difficulty, source, curriculum, etc.)
	 */
	metadata?: Record<string, any>;
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
	sampleAnswer?: string;
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

export interface HotspotPoint { x: number; y: number; }

export interface HotspotRegion {
	id: string;
	label?: string;
	points: HotspotPoint[];
}

export interface HotspotImageMeta {
	url: string;
	width: number;
	height: number;
	alt?: string;
}

export interface HotspotScoringRule {
	mode: 'all' | 'partial';
	maxSelections?: number;
}

export interface HotspotItem extends BaseItemEntity {
	kind: 'HOTSPOT';
	image: HotspotImageMeta;
	hotspots: HotspotRegion[];
	scoring: HotspotScoringRule;
}

export interface DragDropToken {
	id: string;
	label: string;
	category?: string;
}

export interface DragDropZone {
	id: string;
	label?: string;
	acceptsTokenIds?: string[];
	acceptsCategories?: string[];
	correctTokenIds: string[];
	evaluation?: 'set' | 'ordered';
	maxTokens?: number;
}

export interface DragDropScoringRule {
	mode: 'all' | 'per_zone' | 'per_token';
}

export interface DragDropItem extends BaseItemEntity {
	kind: 'DRAG_AND_DROP';
	tokens: DragDropToken[];
	zones: DragDropZone[];
	scoring: DragDropScoringRule;
}

export interface ScenarioAttachment {
	id: string;
	label: string;
	url: string;
	kind: 'reference' | 'starter' | 'supporting' | 'dataset';
	contentType?: string;
	sizeBytes?: number;
}

export interface ScenarioWorkspaceTemplate {
	templateRepositoryUrl?: string;
	branch?: string;
	instructions?: string[];
}

export interface ScenarioTestCase {
	id: string;
	description?: string;
	weight?: number;
}

export interface ScenarioEvaluationConfig {
	mode: 'manual' | 'automated';
	automationServiceId?: string;
	runtime?: string;
	entryPoint?: string;
	timeoutSeconds?: number;
	testCases?: ScenarioTestCase[];
}

export interface ScenarioScoringRule {
	maxScore: number;
	rubric?: { id: string; description?: string; weight?: number }[];
}

export interface ScenarioTaskItem extends BaseItemEntity {
	kind: 'SCENARIO_TASK';
	brief: string;
	attachments?: ScenarioAttachment[];
	workspace?: ScenarioWorkspaceTemplate;
	evaluation: ScenarioEvaluationConfig;
	scoring: ScenarioScoringRule;
}

export type Item = ChoiceItem | FillBlankItem | MatchingItem | OrderingItem | ShortAnswerItem | EssayItem | NumericEntryItem | HotspotItem | DragDropItem | ScenarioTaskItem;

export interface Assessment extends BaseEntity {
	title: string;
	description?: string;
	collectionId?: string;
	tags?: string[];
	metadata?: Record<string, any>;
	itemIds: string[];
	allowedAttempts: number;
	timeLimitMinutes?: number;
}

export interface CohortAssignment {
	assessmentId: string;
	allowedAttempts?: number;
	availableFrom?: string;
	dueDate?: string;
}

export interface Cohort extends BaseEntity {
	name: string;
	description?: string;
	learnerIds: string[];
	assessmentIds: string[]; // Deprecated: use assignments
	assignments?: CohortAssignment[];
}

export interface AttemptResponse {
	itemId: string;
	answerIndexes?: number[];
	textAnswers?: string[];
	matchingAnswers?: { promptId: string; targetId: string }[];
	orderingAnswer?: string[];
	essayAnswer?: string;
	numericAnswer?: { value: number; unit?: string };
	hotspotAnswers?: HotspotPoint[];
	dragDropAnswers?: { tokenId: string; dropZoneId: string; position?: number }[];
	scenarioAnswer?: { repositoryUrl?: string; artifactUrl?: string; submissionNotes?: string; files?: { path: string; url?: string }[] };
}

export interface Attempt extends BaseEntity {
	assessmentId: string;
	userId: string;
	status: 'in_progress' | 'submitted' | 'scored';
	responses: AttemptResponse[];
	score?: number;
	maxScore?: number;
	items?: Item[];
}

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

export interface TaxonomyField {
	key: string;
	label: string;
	type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
	required: boolean;
	allowedValues?: (string | number | boolean)[];
	description?: string;
}

export interface TaxonomyConfig {
	categories: string[];
	tags: {
		predefined: string[];
		allowCustom: boolean;
	};
	metadataFields: TaxonomyField[];
}
