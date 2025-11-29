import type { SQLiteDatabase } from './client.js';
import type { Assessment, Attempt, FillBlankItem, Item, MatchingItem } from '../../common/types.js';

function isFillBlankItem(item: Item): item is FillBlankItem {
  return item.kind === 'FILL_IN_THE_BLANK';
}

function isMatchingItem(item: Item): item is MatchingItem {
  return item.kind === 'MATCHING';
}

export function insertItem(db: SQLiteDatabase, item: Item): Item {
  db.prepare(`
    INSERT INTO items (id, tenant_id, kind, prompt, choices_json, answer_mode, correct_indexes_json, blank_schema_json, matching_schema_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      kind = excluded.kind,
      prompt = excluded.prompt,
      choices_json = excluded.choices_json,
      answer_mode = excluded.answer_mode,
      correct_indexes_json = excluded.correct_indexes_json,
      blank_schema_json = excluded.blank_schema_json,
      matching_schema_json = excluded.matching_schema_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    item.id,
    item.tenantId,
    item.kind,
    item.prompt,
    JSON.stringify(isFillBlankItem(item) || isMatchingItem(item) ? [] : item.choices),
    isFillBlankItem(item) || isMatchingItem(item) ? 'single' : item.answerMode,
    JSON.stringify(isFillBlankItem(item) || isMatchingItem(item) ? [] : item.correctIndexes),
    isFillBlankItem(item) ? JSON.stringify({ blanks: item.blanks, scoring: item.scoring }) : null,
    isMatchingItem(item) ? JSON.stringify({ prompts: item.prompts, targets: item.targets, scoring: item.scoring }) : null,
    item.createdAt,
    item.updatedAt,
  );
  return item;
}

export function insertAssessment(db: SQLiteDatabase, assessment: Assessment): Assessment {
  db.prepare(`
    INSERT INTO assessments (id, tenant_id, title, item_ids_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      title = excluded.title,
      item_ids_json = excluded.item_ids_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    assessment.id,
    assessment.tenantId,
    assessment.title,
    JSON.stringify(assessment.itemIds),
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

export function getItemById(db: SQLiteDatabase, tenantId: string, itemId: string): Item | undefined {
  const row = db.prepare(`
    SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, created_at as createdAt, updated_at as updatedAt
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
  ].map(item => ({ ...item, tenantId: seedTenantId }));
}

export function seedDefaultTenantData(db: SQLiteDatabase, tenantId: string): void {
  const sampleItems = tenantSampleItems(tenantId);
  const existing = getItemById(db, tenantId, sampleItems[0].id);
  if (existing) {
    console.log('Seed data already exists for tenant:', tenantId);
    return;
  }
  const now = new Date().toISOString();
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
    createdAt: now,
    updatedAt: now,
  });
}
