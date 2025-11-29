import type { ItemRepository } from './item.repository.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type {
  ChoiceItem,
  DragDropItem,
  EssayItem,
  FillBlankItem,
  HotspotItem,
  Item,
  MatchingItem,
  NumericEntryItem,
  OrderingItem,
  ShortAnswerItem,
} from '../../common/types.js';

function isChoiceItem(item: Item): item is ChoiceItem {
  return item.kind === 'MCQ' || item.kind === 'TRUE_FALSE';
}

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

export function createSQLiteItemRepository(client: SQLiteTenantClient): ItemRepository {
  return {
    save(item) {
      const db = client.getConnection(item.tenantId);
      db.prepare(`
        INSERT INTO items (id, tenant_id, kind, prompt, choices_json, answer_mode, correct_indexes_json, blank_schema_json, matching_schema_json, ordering_schema_json, short_answer_schema_json, essay_schema_json, numeric_schema_json, hotspot_schema_json, drag_drop_schema_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
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
        isOrderingItem(item)
          ? JSON.stringify({ options: item.options, correctOrder: item.correctOrder, scoring: item.scoring })
          : null,
        isShortAnswerItem(item)
          ? JSON.stringify({ rubric: item.rubric, scoring: item.scoring })
          : null,
        isEssayItem(item)
          ? JSON.stringify({ rubric: item.rubric, length: item.length, scoring: item.scoring })
          : null,
        isNumericItem(item)
          ? JSON.stringify({ validation: item.validation, units: item.units })
          : null,
        isHotspotItem(item)
          ? JSON.stringify({ image: item.image, hotspots: item.hotspots, scoring: item.scoring })
          : null,
        isDragDropItem(item)
          ? JSON.stringify({ tokens: item.tokens, zones: item.zones, scoring: item.scoring })
          : null,
        item.createdAt,
        item.updatedAt,
      );
      return item;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, ordering_schema_json as orderingSchemaJson, short_answer_schema_json as shortAnswerSchemaJson, essay_schema_json as essaySchemaJson, numeric_schema_json as numericSchemaJson, hotspot_schema_json as hotspotSchemaJson, drag_drop_schema_json as dragDropSchemaJson, created_at as createdAt, updated_at as updatedAt
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
        } satisfies Item;
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
        } satisfies Item;
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
        } satisfies Item;
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
        } satisfies Item;
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
        } satisfies Item;
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
          SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, answer_mode as answerMode, correct_indexes_json as correctIndexesJson, blank_schema_json as blankSchemaJson, matching_schema_json as matchingSchemaJson, ordering_schema_json as orderingSchemaJson, short_answer_schema_json as shortAnswerSchemaJson, essay_schema_json as essaySchemaJson, numeric_schema_json as numericSchemaJson, hotspot_schema_json as hotspotSchemaJson, drag_drop_schema_json as dragDropSchemaJson, created_at as createdAt, updated_at as updatedAt
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
          } satisfies Item;
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
          } satisfies Item;
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
          } satisfies Item;
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
          } satisfies Item;
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
          } satisfies Item;
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
