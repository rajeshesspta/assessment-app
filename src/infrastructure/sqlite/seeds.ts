import type { SQLiteDatabase } from './client.js';
import type { Assessment, Attempt, EssayItem, FillBlankItem, Item, MatchingItem, OrderingItem, ShortAnswerItem } from '../../common/types.js';

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

export function insertItem(db: SQLiteDatabase, item: Item): Item {
  db.prepare(`
    INSERT INTO items (id, tenant_id, kind, prompt, choices_json, answer_mode, correct_indexes_json, blank_schema_json, matching_schema_json, ordering_schema_json, short_answer_schema_json, essay_schema_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    item.id,
    item.tenantId,
    item.kind,
    item.prompt,
    JSON.stringify(isFillBlankItem(item) || isMatchingItem(item) || isOrderingItem(item) || isShortAnswerItem(item) || isEssayItem(item) ? [] : item.choices),
    isFillBlankItem(item) || isMatchingItem(item) || isOrderingItem(item) || isShortAnswerItem(item) || isEssayItem(item) ? 'single' : item.answerMode,
    JSON.stringify(isFillBlankItem(item) || isMatchingItem(item) || isOrderingItem(item) || isShortAnswerItem(item) || isEssayItem(item) ? [] : item.correctIndexes),
    isFillBlankItem(item) ? JSON.stringify({ blanks: item.blanks, scoring: item.scoring }) : null,
    isMatchingItem(item) ? JSON.stringify({ prompts: item.prompts, targets: item.targets, scoring: item.scoring }) : null,
    isOrderingItem(item) ? JSON.stringify({ options: item.options, correctOrder: item.correctOrder, scoring: item.scoring }) : null,
    isShortAnswerItem(item) ? JSON.stringify({ rubric: item.rubric, scoring: item.scoring }) : null,
    isEssayItem(item) ? JSON.stringify({ rubric: item.rubric, length: item.length, scoring: item.scoring }) : null,
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
    SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, ordering_schema_json as orderingSchemaJson, short_answer_schema_json as shortAnswerSchemaJson, essay_schema_json as essaySchemaJson, created_at as createdAt, updated_at as updatedAt
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
