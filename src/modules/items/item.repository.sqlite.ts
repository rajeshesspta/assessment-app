import type { ItemRepository } from './item.repository.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type { ChoiceItem, FillBlankItem, Item, MatchingItem } from '../../common/types.js';

function isChoiceItem(item: Item): item is ChoiceItem {
  return item.kind === 'MCQ' || item.kind === 'TRUE_FALSE';
}

function isFillBlankItem(item: Item): item is FillBlankItem {
  return item.kind === 'FILL_IN_THE_BLANK';
}

function isMatchingItem(item: Item): item is MatchingItem {
  return item.kind === 'MATCHING';
}

export function createSQLiteItemRepository(client: SQLiteTenantClient): ItemRepository {
  return {
    save(item) {
      const db = client.getConnection(item.tenantId);
      db.prepare(`
        INSERT INTO items (id, tenant_id, kind, prompt, choices_json, answer_mode, correct_indexes_json, blank_schema_json, matching_schema_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
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
        JSON.stringify(isChoiceItem(item) ? item.choices : []),
        isChoiceItem(item) ? item.answerMode : 'single',
        JSON.stringify(isChoiceItem(item) ? item.correctIndexes : []),
        isFillBlankItem(item) ? JSON.stringify({ blanks: item.blanks, scoring: item.scoring }) : null,
        isMatchingItem(item) ? JSON.stringify({ prompts: item.prompts, targets: item.targets, scoring: item.scoring }) : null,
        item.createdAt,
        item.updatedAt,
      );
      return item;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, created_at as createdAt, updated_at as updatedAt
        FROM items
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId);
      if (!row) {
        return undefined;
      }
      if (row.kind === 'FILL_IN_THE_BLANK') {
        const schema = row.blankSchemaJson ? JSON.parse(row.blankSchemaJson) : undefined;
        const blanks = schema?.blanks ?? [];
        const scoring = schema?.scoring ?? { mode: 'all' };
        return {
          id: row.id,
          tenantId: row.tenantId,
          kind: 'FILL_IN_THE_BLANK',
          prompt: row.prompt,
          blanks,
          scoring,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } satisfies Item;
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
        } satisfies Item;
      }
      const choices = JSON.parse(row.choicesJson) as ChoiceItem['choices'];
      return {
        id: row.id,
        tenantId: row.tenantId,
        kind: row.kind as ChoiceItem['kind'],
        prompt: row.prompt,
        choices,
        answerMode: row.answerMode,
        correctIndexes: JSON.parse(row.correctIndexesJson) as ChoiceItem['correctIndexes'],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies Item;
    },
    list(tenantId, options = {}) {
      const db = client.getConnection(tenantId);
      const limit = options.limit ?? 10;
      const offset = options.offset ?? 0;
      const clauses = ['tenant_id = ?'];
      const params: unknown[] = [tenantId];
      if (options.kind) {
        clauses.push('kind = ?');
        params.push(options.kind);
      }
      if (options.search) {
        clauses.push('lower(prompt) LIKE ?');
        params.push(`%${options.search.toLowerCase()}%`);
      }
      params.push(limit, offset);
      const rows = db
        .prepare(`
          SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, created_at as createdAt, updated_at as updatedAt
          FROM items
          WHERE ${clauses.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `)
        .all(...params);
      return rows.map(row => {
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
          } satisfies Item;
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
          } satisfies Item;
        }
        return {
          id: row.id,
          tenantId: row.tenantId,
          kind: row.kind as ChoiceItem['kind'],
          prompt: row.prompt,
          choices: JSON.parse(row.choicesJson) as ChoiceItem['choices'],
          answerMode: row.answerMode,
          correctIndexes: JSON.parse(row.correctIndexesJson) as ChoiceItem['correctIndexes'],
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } satisfies Item;
      });
    },
  };
}
