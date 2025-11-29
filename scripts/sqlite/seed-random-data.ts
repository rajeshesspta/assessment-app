import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../src/config/index.js';
import { createSQLiteTenantClient } from '../../src/infrastructure/sqlite/client.js';
import { insertAssessment, insertAttempt, insertItem } from '../../src/infrastructure/sqlite/seeds.js';
import type { Assessment, Attempt, Item } from '../../src/common/types.js';
import { clearTenantTables } from './utils.js';

interface SeedOptions {
  tenantId: string;
  items: number;
  assessments: number;
  attempts: number;
  append: boolean;
}

function parseArgs(argv: string[]): SeedOptions {
  let tenantId = process.env.API_TENANT_ID ?? 'dev-tenant';
  let items = 12;
  let assessments = 4;
  let attempts = 10;
  let append = false;

  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      tenantId = arg.slice('--tenant='.length);
    } else if (arg.startsWith('--items=')) {
      const value = Number.parseInt(arg.slice('--items='.length), 10);
      if (Number.isFinite(value) && value > 0) items = value;
    } else if (arg.startsWith('--assessments=')) {
      const value = Number.parseInt(arg.slice('--assessments='.length), 10);
      if (Number.isFinite(value) && value > 0) assessments = value;
    } else if (arg.startsWith('--attempts=')) {
      const value = Number.parseInt(arg.slice('--attempts='.length), 10);
      if (Number.isFinite(value) && value >= 0) attempts = value;
    } else if (arg === '--append') {
      append = true;
    }
  }

  return { tenantId, items, assessments, attempts, append };
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffle<T>(input: T[]): T[] {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildRandomItem(tenantId: string): Item {
  const a = randomInt(40) + 10;
  const b = randomInt(40) + 5;
  const correctValue = a + b;

  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const jitter = randomInt(9) - 4;
    const candidate = correctValue + jitter || correctValue + 1;
    if (candidate > 0 && candidate !== correctValue) {
      distractors.add(candidate);
    }
  }

  const options = [correctValue, ...distractors];
  const shuffled = shuffle(options);
  const correctIndex = shuffled.findIndex(value => value === correctValue);
  const now = new Date().toISOString();

  return {
    id: `random-item-${randomUUID()}`,
    tenantId,
    kind: 'MCQ',
    prompt: `What is ${a} + ${b}?`,
    choices: shuffled.map(value => ({ text: value.toString() })),
    answerMode: 'single',
    correctIndexes: [correctIndex],
    createdAt: now,
    updatedAt: now,
  };
}

function buildRandomAssessment(tenantId: string, items: Item[], index: number): Assessment {
  const selectionSize = Math.min(items.length, Math.max(2, randomInt(4) + 2));
  const picked = shuffle(items).slice(0, selectionSize).map(item => item.id);
  const now = new Date().toISOString();
  return {
    id: `random-assessment-${randomUUID()}`,
    tenantId,
    title: `Math Drill ${index + 1}`,
    itemIds: picked,
    createdAt: now,
    updatedAt: now,
  };
}

function buildRandomAttempt(
  tenantId: string,
  assessment: Assessment,
  itemById: Map<string, Item>,
): Attempt {
  const statuses: Attempt['status'][] = ['in_progress', 'submitted', 'scored'];
  const status = statuses[randomInt(statuses.length)];
  const now = new Date().toISOString();
  const responses = assessment.itemIds.map(itemId => {
    const item = itemById.get(itemId);
    if (!item) {
      return { itemId };
    }
    if (item.answerMode === 'single') {
      return { itemId, answerIndexes: [randomInt(item.choices.length)] };
    }
    const picks = new Set<number>();
    const desired = Math.max(2, Math.min(item.choices.length, randomInt(item.choices.length) + 1));
    while (picks.size < desired) {
      picks.add(randomInt(item.choices.length));
    }
    return { itemId, answerIndexes: Array.from(picks) };
  });
  const maxScore = responses.length;
  const score = status === 'scored'
    ? responses.reduce((total, response) => {
        const item = itemById.get(response.itemId);
        if (!item || !response.answerIndexes || response.answerIndexes.length === 0) return total;
        const answers = Array.from(new Set(response.answerIndexes)).sort((x, y) => x - y);
        const expected = [...item.correctIndexes].sort((x, y) => x - y);
        if (item.answerMode === 'single') {
          return answers.length === 1 && answers[0] === expected[0] ? total + 1 : total;
        }
        const matches = answers.length === expected.length && expected.every((value, idx) => value === answers[idx]);
        return matches ? total + 1 : total;
      }, 0)
    : undefined;

  return {
    id: `random-attempt-${randomUUID()}`,
    tenantId,
    assessmentId: assessment.id,
    userId: `user-${1000 + randomInt(9000)}`,
    status,
    responses,
    score,
    maxScore: status === 'scored' ? maxScore : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = createSQLiteTenantClient(config.persistence.sqlite);
  const db = client.getConnection(options.tenantId);

  try {
    if (!options.append) {
      clearTenantTables(db, options.tenantId);
    }

    const items: Item[] = [];
    for (let i = 0; i < options.items; i += 1) {
      items.push(insertItem(db, buildRandomItem(options.tenantId)));
    }

    if (items.length === 0) {
      console.log('No items generated; skipping assessments/attempts.');
      return;
    }

    const assessments: Assessment[] = [];
    const effectiveAssessmentCount = Math.min(options.assessments, items.length);
    for (let i = 0; i < effectiveAssessmentCount; i += 1) {
      assessments.push(insertAssessment(db, buildRandomAssessment(options.tenantId, items, i)));
    }

    const attempts: Attempt[] = [];
    const itemById = new Map(items.map(item => [item.id, item] as const));
    if (assessments.length > 0) {
      for (let i = 0; i < options.attempts; i += 1) {
        const assessment = assessments[randomInt(assessments.length)];
        attempts.push(insertAttempt(db, buildRandomAttempt(options.tenantId, assessment, itemById)));
      }
    }

    console.log(`Seeded ${items.length} items, ${assessments.length} assessments, and ${attempts.length} attempts for tenant "${options.tenantId}".`);
  } finally {
    client.closeAll();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
