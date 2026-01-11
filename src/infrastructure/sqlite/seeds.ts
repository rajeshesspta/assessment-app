import type { SQLiteDatabase } from './client.js';
import type {
  Assessment,
  Attempt,
  DragDropItem,
  EssayItem,
  FillBlankItem,
  HotspotItem,
  Item,
  MatchingItem,
  NumericEntryItem,
  OrderingItem,
  ScenarioTaskItem,
  ShortAnswerItem,
  User,
} from '../../common/types.js';

function isFillBlankItem(item: Item): item is FillBlankItem {
  return item.kind === 'FILL_IN_THE_BLANK';
}

function isMatchingItem(item: Item): item is MatchingItem {
  return item.kind === 'MATCHING';
}

function isOrderingItem(item: Item): item is OrderingItem {
  return item.kind === 'ORDERING';
}

function isShortAnswerItem(item: Item): item is ShortAnswerItem {
  return item.kind === 'SHORT_ANSWER';
}

function isEssayItem(item: Item): item is EssayItem {
  return item.kind === 'ESSAY';
}

function isNumericItem(item: Item): item is NumericEntryItem {
  return item.kind === 'NUMERIC_ENTRY';
}

function isHotspotItem(item: Item): item is HotspotItem {
  return item.kind === 'HOTSPOT';
}

function isDragDropItem(item: Item): item is DragDropItem {
  return item.kind === 'DRAG_AND_DROP';
}

function isScenarioTaskItem(item: Item): item is ScenarioTaskItem {
  return item.kind === 'SCENARIO_TASK';
}

export function insertItem(db: SQLiteDatabase, item: Item): Item {
  db.prepare(`
    INSERT INTO items (id, tenant_id, kind, prompt, choices_json, answer_mode, correct_indexes_json, blank_schema_json, matching_schema_json, ordering_schema_json, short_answer_schema_json, essay_schema_json, numeric_schema_json, hotspot_schema_json, drag_drop_schema_json, scenario_schema_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      kind = excluded.kind,
      prompt = excluded.prompt,
      choices_json = excluded.choices_json,
      answer_mode = excluded.answer_mode,
      correct_indexes_json = excluded.correct_indexes_json,
      blank_schema_json = excluded.blank_schema_json,
      matching_schema_json = excluded.matching_schema_json,
      ordering_schema_json = excluded.ordering_schema_json,
      short_answer_schema_json = excluded.short_answer_schema_json,
      essay_schema_json = excluded.essay_schema_json,
        numeric_schema_json = excluded.numeric_schema_json,
        hotspot_schema_json = excluded.hotspot_schema_json,
        drag_drop_schema_json = excluded.drag_drop_schema_json,
        scenario_schema_json = excluded.scenario_schema_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    item.id,
    item.tenantId,
    item.kind,
    item.prompt,
    JSON.stringify(
      isFillBlankItem(item)
        || isMatchingItem(item)
        || isOrderingItem(item)
        || isShortAnswerItem(item)
        || isEssayItem(item)
        || isNumericItem(item)
        || isHotspotItem(item)
        || isDragDropItem(item)
        || isScenarioTaskItem(item)
        ? []
        : item.choices,
    ),
    isFillBlankItem(item)
      || isMatchingItem(item)
      || isOrderingItem(item)
      || isShortAnswerItem(item)
      || isEssayItem(item)
      || isNumericItem(item)
      || isHotspotItem(item)
      || isDragDropItem(item)
      || isScenarioTaskItem(item)
      ? 'single'
      : item.answerMode,
    JSON.stringify(
      isFillBlankItem(item)
        || isMatchingItem(item)
        || isOrderingItem(item)
        || isShortAnswerItem(item)
        || isEssayItem(item)
        || isNumericItem(item)
        || isHotspotItem(item)
        || isDragDropItem(item)
        || isScenarioTaskItem(item)
        ? []
        : item.correctIndexes,
    ),
    isFillBlankItem(item) ? JSON.stringify({ blanks: item.blanks, scoring: item.scoring }) : null,
    isMatchingItem(item) ? JSON.stringify({ prompts: item.prompts, targets: item.targets, scoring: item.scoring }) : null,
    isOrderingItem(item) ? JSON.stringify({ options: item.options, correctOrder: item.correctOrder, scoring: item.scoring }) : null,
    isShortAnswerItem(item) ? JSON.stringify({ rubric: item.rubric, scoring: item.scoring }) : null,
    isEssayItem(item) ? JSON.stringify({ rubric: item.rubric, length: item.length, scoring: item.scoring }) : null,
    isNumericItem(item) ? JSON.stringify({ validation: item.validation, units: item.units }) : null,
    isHotspotItem(item) ? JSON.stringify({ image: item.image, hotspots: item.hotspots, scoring: item.scoring }) : null,
    isDragDropItem(item) ? JSON.stringify({ tokens: item.tokens, zones: item.zones, scoring: item.scoring }) : null,
    isScenarioTaskItem(item)
      ? JSON.stringify({
          brief: item.brief,
          attachments: item.attachments,
          workspace: item.workspace,
          evaluation: item.evaluation,
          scoring: item.scoring,
        })
      : null,
    item.createdAt,
    item.updatedAt,
  );
  return item;
}

export function insertAssessment(db: SQLiteDatabase, assessment: Assessment): Assessment {
  db.prepare(`
    INSERT INTO assessments (id, tenant_id, title, item_ids_json, allowed_attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      title = excluded.title,
      item_ids_json = excluded.item_ids_json,
      allowed_attempts = excluded.allowed_attempts,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    assessment.id,
    assessment.tenantId,
    assessment.title,
    JSON.stringify(assessment.itemIds),
    assessment.allowedAttempts,
    assessment.createdAt,
    assessment.updatedAt,
  );
  return assessment;
}

export function insertAttempt(db: SQLiteDatabase, attempt: Attempt): Attempt {
  db.prepare(`
    INSERT INTO attempts (id, tenant_id, assessment_id, user_id, status, responses_json, score, max_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      assessment_id = excluded.assessment_id,
      user_id = excluded.user_id,
      status = excluded.status,
      responses_json = excluded.responses_json,
      score = excluded.score,
      max_score = excluded.max_score,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    attempt.id,
    attempt.tenantId,
    attempt.assessmentId,
    attempt.userId,
    attempt.status,
    JSON.stringify(attempt.responses),
    attempt.score ?? null,
    attempt.maxScore ?? null,
    attempt.createdAt,
    attempt.updatedAt,
  );
  return attempt;
}

export function insertUser(db: SQLiteDatabase, user: User): User {
  db.prepare(`
    INSERT INTO users (id, tenant_id, role, roles_json, email, display_name, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      role = excluded.role,
      roles_json = excluded.roles_json,
      email = excluded.email,
      display_name = excluded.display_name,
      status = excluded.status,
      created_by = excluded.created_by,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    user.id,
    user.tenantId,
    user.roles[0],
    JSON.stringify(user.roles),
    user.email,
    user.displayName ?? null,
    user.status,
    user.createdBy ?? null,
    user.createdAt,
    user.updatedAt,
  );
  return user;
}

export function getItemById(db: SQLiteDatabase, tenantId: string, itemId: string): Item | undefined {
  const row = db.prepare(`
    SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, ordering_schema_json as orderingSchemaJson, short_answer_schema_json as shortAnswerSchemaJson, essay_schema_json as essaySchemaJson, numeric_schema_json as numericSchemaJson, hotspot_schema_json as hotspotSchemaJson, drag_drop_schema_json as dragDropSchemaJson, scenario_schema_json as scenarioSchemaJson, created_at as createdAt, updated_at as updatedAt
    FROM items
    WHERE tenant_id = ? AND id = ?
  `).get(tenantId, itemId);
  if (!row) {
    return undefined;
  }
  if (row.kind === 'FILL_IN_THE_BLANK') {
    const schema = row.blankSchemaJson ? JSON.parse(row.blankSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'FILL_IN_THE_BLANK',
      prompt: row.prompt,
      blanks: schema?.blanks ?? [],
      scoring: schema?.scoring ?? { mode: 'all' },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'MATCHING') {
    const schema = row.matchingSchemaJson ? JSON.parse(row.matchingSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'MATCHING',
      prompt: row.prompt,
      prompts: schema?.prompts ?? [],
      targets: schema?.targets ?? [],
      scoring: schema?.scoring ?? { mode: 'partial' },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'ORDERING') {
    const schema = row.orderingSchemaJson ? JSON.parse(row.orderingSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'ORDERING',
      prompt: row.prompt,
      options: schema?.options ?? [],
      correctOrder: schema?.correctOrder ?? [],
      scoring: schema?.scoring ?? { mode: 'all' },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'SHORT_ANSWER') {
    const schema = row.shortAnswerSchemaJson ? JSON.parse(row.shortAnswerSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'SHORT_ANSWER',
      prompt: row.prompt,
      rubric: schema?.rubric,
      scoring: schema?.scoring ?? { mode: 'manual', maxScore: 1 },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'ESSAY') {
    const schema = row.essaySchemaJson ? JSON.parse(row.essaySchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'ESSAY',
      prompt: row.prompt,
      rubric: schema?.rubric,
      length: schema?.length,
      scoring: schema?.scoring ?? { mode: 'manual', maxScore: 10 },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'NUMERIC_ENTRY') {
    const schema = row.numericSchemaJson ? JSON.parse(row.numericSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'NUMERIC_ENTRY',
      prompt: row.prompt,
      validation: schema?.validation,
      units: schema?.units,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'HOTSPOT') {
    const schema = row.hotspotSchemaJson ? JSON.parse(row.hotspotSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'HOTSPOT',
      prompt: row.prompt,
      image: schema?.image,
      hotspots: schema?.hotspots ?? [],
      scoring: schema?.scoring ?? { mode: 'all' },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'DRAG_AND_DROP') {
    const schema = row.dragDropSchemaJson ? JSON.parse(row.dragDropSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'DRAG_AND_DROP',
      prompt: row.prompt,
      tokens: schema?.tokens ?? [],
      zones: schema?.zones ?? [],
      scoring: schema?.scoring ?? { mode: 'all' },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  if (row.kind === 'SCENARIO_TASK') {
    const schema = row.scenarioSchemaJson ? JSON.parse(row.scenarioSchemaJson) : undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: 'SCENARIO_TASK',
      prompt: row.prompt,
      brief: schema?.brief ?? row.prompt,
      attachments: schema?.attachments,
      workspace: schema?.workspace,
      evaluation: schema?.evaluation ?? { mode: 'manual' },
      scoring: schema?.scoring ?? { maxScore: 0 },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Item;
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    prompt: row.prompt,
    choices: JSON.parse(row.choicesJson),
    answerMode: row.answerMode,
    correctIndexes: JSON.parse(row.correctIndexesJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Item;
}

function tenantSampleItems(seedTenantId: string) {
  return [
    {
      id: 'sample-item-1',
      kind: 'MCQ' as Item['kind'],
      prompt: 'Capital of France?',
      choices: [{ text: 'Paris' }, { text: 'Berlin' }, { text: 'Madrid' }, { text: 'Rome' }],
      correctIndexes: [0],
    },
    {
      id: 'sample-item-2',
      kind: 'MCQ' as Item['kind'],
      prompt: '2 + 2 = ?',
      choices: [{ text: '3' }, { text: '4' }, { text: '5' }],
      correctIndexes: [1],
    },
    {
      id: 'sample-item-3',
      kind: 'MCQ' as Item['kind'],
      prompt: 'Select the prime numbers',
      choices: [{ text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }],
      correctIndexes: [0, 1, 3],
    },
    {
      id: 'sample-item-4',
      kind: 'TRUE_FALSE' as Item['kind'],
      prompt: 'The Pacific Ocean is the largest on Earth.',
      choices: [{ text: 'True' }, { text: 'False' }],
      correctIndexes: [0],
    },
    {
      id: 'sample-item-5',
      kind: 'FILL_IN_THE_BLANK' as Item['kind'],
      prompt: 'Fill the blank: The tallest mountain is ___',
      blanks: [{
        id: 'blank-1',
        acceptableAnswers: [
          { type: 'exact', value: 'Mount Everest', caseSensitive: false },
          { type: 'regex', pattern: 'everest', flags: 'i' },
        ],
      }],
      scoring: { mode: 'all' },
    },
    {
      id: 'sample-item-6',
      kind: 'MATCHING' as Item['kind'],
      prompt: 'Match each country to its capital',
      prompts: [
        { id: 'p-1', text: 'France', correctTargetId: 't-1' },
        { id: 'p-2', text: 'Germany', correctTargetId: 't-2' },
      ],
      targets: [
        { id: 't-1', text: 'Paris' },
        { id: 't-2', text: 'Berlin' },
        { id: 't-3', text: 'Rome' },
      ],
      scoring: { mode: 'partial' },
    },
    {
      id: 'sample-item-7',
      kind: 'ORDERING' as Item['kind'],
      prompt: 'Rank the planets from closest to farthest from the sun',
      options: [
        { id: 'opt-1', text: 'Mercury' },
        { id: 'opt-2', text: 'Venus' },
        { id: 'opt-3', text: 'Earth' },
      ],
      correctOrder: ['opt-1', 'opt-2', 'opt-3'],
      scoring: { mode: 'partial_pairs' },
    },
    {
      id: 'sample-item-8',
      kind: 'SHORT_ANSWER' as Item['kind'],
      prompt: 'Explain why seasons change throughout the year.',
      rubric: {
        keywords: ['tilt', 'axis', 'orbit'],
        guidance: 'Mention Earth tilt and orbit around the sun',
      },
      scoring: { mode: 'manual', maxScore: 3 },
    },
    {
      id: 'sample-item-9',
      kind: 'ESSAY' as Item['kind'],
      prompt: 'Discuss the long-term impacts of industrialization on urban planning.',
      rubric: {
        guidance: 'Address infrastructure, social change, and sustainability.',
        keywords: ['infrastructure', 'migration', 'sustainability'],
        sections: [
          { id: 'structure', title: 'Structure', maxScore: 3 },
          { id: 'analysis', title: 'Analysis', maxScore: 4 },
          { id: 'evidence', title: 'Evidence', maxScore: 3 },
        ],
      },
      length: { minWords: 250, maxWords: 600, recommendedWords: 400 },
      scoring: { mode: 'manual', maxScore: 10 },
    },
    {
      id: 'sample-item-10',
      kind: 'NUMERIC_ENTRY' as Item['kind'],
      prompt: 'Report the acceleration due to gravity on Earth in m/s^2.',
      validation: { mode: 'exact', value: 9.81, tolerance: 0.05 },
      units: { label: 'Meters per second squared', symbol: 'm/s^2', precision: 2 },
    },
    {
      id: 'sample-item-11',
      kind: 'HOTSPOT' as Item['kind'],
      prompt: 'Identify the continents highlighted on the map.',
      image: { url: 'https://example.com/world-map.png', width: 1200, height: 675, alt: 'World map outline' },
      hotspots: [
        {
          id: 'americas',
          label: 'Americas',
          points: [{ x: 0.18, y: 0.25 }, { x: 0.32, y: 0.22 }, { x: 0.34, y: 0.55 }, { x: 0.2, y: 0.6 }],
        },
        {
          id: 'europe',
          label: 'Europe',
          points: [{ x: 0.56, y: 0.18 }, { x: 0.61, y: 0.18 }, { x: 0.63, y: 0.26 }, { x: 0.57, y: 0.28 }],
        },
      ],
      scoring: { mode: 'partial', maxSelections: 3 },
    },
    {
      id: 'sample-item-12',
      kind: 'DRAG_AND_DROP' as Item['kind'],
      prompt: 'Drag each species into the correct habitat.',
      tokens: [
        { id: 'token-fox', label: 'Arctic Fox', category: 'tundra' },
        { id: 'token-camel', label: 'Camel', category: 'desert' },
        { id: 'token-parrot', label: 'Parrot', category: 'rainforest' },
      ],
      zones: [
        { id: 'zone-tundra', label: 'Tundra', acceptsCategories: ['tundra'], correctTokenIds: ['token-fox'], evaluation: 'set', maxTokens: 2 },
        { id: 'zone-desert', label: 'Desert', acceptsCategories: ['desert'], correctTokenIds: ['token-camel'], evaluation: 'set' },
        { id: 'zone-rainforest', label: 'Rainforest', acceptsCategories: ['rainforest'], correctTokenIds: ['token-parrot'], evaluation: 'set' },
      ],
      scoring: { mode: 'per_zone' },
    },
    {
      id: 'sample-item-13',
      kind: 'SCENARIO_TASK' as Item['kind'],
      prompt: 'Stabilize the checkout microservice',
      brief: 'Investigate flaky checkout tests and harden telemetry before peak traffic.',
      attachments: [
        { id: 'runbook', label: 'Runbook', url: 'https://example.com/runbooks/checkout.pdf', kind: 'reference' },
        { id: 'repo', label: 'Service Repo', url: 'https://github.com/example/checkout', kind: 'starter' },
      ],
      workspace: {
        templateRepositoryUrl: 'https://github.com/example/checkout-template',
        branch: 'main',
        instructions: ['Install dependencies', 'Run npm test', 'Attach pipeline report'],
      },
      evaluation: {
        mode: 'automated',
        automationServiceId: 'azure-devcenter',
        runtime: 'node18',
        entryPoint: 'npm run verify',
        timeoutSeconds: 900,
        testCases: [{ id: 'lint' }, { id: 'unit', weight: 2 }],
      },
      scoring: {
        maxScore: 25,
        rubric: [
          { id: 'correctness', description: 'Pipelines green', weight: 20 },
          { id: 'quality', description: 'Readable diffs', weight: 5 },
        ],
      },
    },
  ].map(item => ({ ...item, tenantId: seedTenantId }));
}

export function seedDefaultTenantData(db: SQLiteDatabase, tenantId: string): void {
  const sampleItems = tenantSampleItems(tenantId);
  const existing = getItemById(db, tenantId, sampleItems[0].id);
  const now = new Date().toISOString();
  if (!existing) {
    for (const item of sampleItems) {
      if (item.kind === 'FILL_IN_THE_BLANK') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'FILL_IN_THE_BLANK',
          prompt: item.prompt,
          blanks: item.blanks,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'MATCHING') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'MATCHING',
          prompt: item.prompt,
          prompts: item.prompts,
          targets: item.targets,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'ORDERING') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'ORDERING',
          prompt: item.prompt,
          options: item.options,
          correctOrder: item.correctOrder,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'SHORT_ANSWER') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'SHORT_ANSWER',
          prompt: item.prompt,
          rubric: item.rubric,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'ESSAY') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'ESSAY',
          prompt: item.prompt,
          rubric: item.rubric,
          length: item.length,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'NUMERIC_ENTRY') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'NUMERIC_ENTRY',
          prompt: item.prompt,
          validation: item.validation,
          units: item.units,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'HOTSPOT') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'HOTSPOT',
          prompt: item.prompt,
          image: item.image,
          hotspots: item.hotspots,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'DRAG_AND_DROP') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'DRAG_AND_DROP',
          prompt: item.prompt,
          tokens: item.tokens,
          zones: item.zones,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      if (item.kind === 'SCENARIO_TASK') {
        insertItem(db, {
          id: item.id,
          tenantId,
          kind: 'SCENARIO_TASK',
          prompt: item.prompt,
          brief: item.brief,
          attachments: item.attachments,
          workspace: item.workspace,
          evaluation: item.evaluation,
          scoring: item.scoring,
          createdAt: now,
          updatedAt: now,
        } as Item);
        continue;
      }
      const choices = item.choices ?? (item.kind === 'TRUE_FALSE' ? [{ text: 'True' }, { text: 'False' }] : []);
      const correctIndexes = item.correctIndexes ?? [];
      insertItem(db, {
        id: item.id,
        tenantId,
        kind: item.kind,
        prompt: item.prompt,
        choices,
        answerMode: correctIndexes.length > 1 ? 'multiple' : 'single',
        correctIndexes,
        createdAt: now,
        updatedAt: now,
      });
    }
    insertAssessment(db, {
      id: 'sample-assessment-1',
      tenantId,
      title: 'Sample Assessment',
      itemIds: sampleItems.map(item => item.id),
      allowedAttempts: 1,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    console.log('Seed data already exists for tenant:', tenantId);
  }

  const adminExists = db
    .prepare('SELECT id FROM users WHERE tenant_id = ? AND role = ? LIMIT 1')
    .get(tenantId, 'TENANT_ADMIN') as { id: string } | undefined;
  if (!adminExists) {
    insertUser(db, {
      id: `seed-admin-${tenantId}`,
      tenantId,
      roles: ['TENANT_ADMIN'],
      email: `seed-admin+${tenantId}@example.com`,
      displayName: `Seed Admin (${tenantId})`,
      status: 'active',
      createdBy: 'seed-script',
      createdAt: now,
      updatedAt: now,
    });
  }
  const localTenants = [
    {
      email: 'learner-1@rubicstricks.com',
      displayName: 'Learner One',
      roles: ['LEARNER'] as User['roles'],
    },
    {
      email: 'ca-1@rubicstricks.com',
      displayName: 'Author One',
      roles: ['CONTENT_AUTHOR'] as User['roles'],
    },
    {
      email: 'ta-1@rubicstricks.com',
      displayName: 'Tenant Admin',
      roles: ['TENANT_ADMIN'] as User['roles'],
    },
  ];

  for (const seedUser of localTenants) {
    const existing = db
      .prepare('SELECT id FROM users WHERE tenant_id = ? AND LOWER(email) = LOWER(?) LIMIT 1')
      .get(tenantId, seedUser.email) as { id: string } | undefined;
    if (existing) {
      continue;
    }
    const safeId = `seed-user-${seedUser.email.replace(/[^a-zA-Z0-9]/g, '-')}`;
    insertUser(db, {
      id: safeId,
      tenantId,
      roles: seedUser.roles,
      email: seedUser.email,
      displayName: seedUser.displayName,
      status: 'active',
      loginMethod: 'UPWD',
      createdBy: 'seed-script',
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function seedSuperAdmin(db: SQLiteDatabase, tenantId: string, email: string = 'admin@bettershift.com'): void {
  const now = new Date().toISOString();
  insertUser(db, {
    id: 'super-admin-user',
    tenantId,
    roles: ['SUPER_ADMIN'],
    email,
    displayName: 'System Super Admin',
    status: 'active',
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Seeded Super Admin: ${email} (${tenantId})`);
}
