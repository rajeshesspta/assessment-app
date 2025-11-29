import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../src/config/index.js';
import { createSQLiteTenantClient } from '../../src/infrastructure/sqlite/client.js';
import { insertItem } from '../../src/infrastructure/sqlite/seeds.js';
import type { Item } from '../../src/common/types.js';

interface SeedOptions {
  tenantId: string;
  count: number;
}

function parseArgs(argv: string[]): SeedOptions {
  let tenantId: string | undefined;
  let count = 5;
  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      tenantId = arg.slice('--tenant='.length);
    }
    if (arg.startsWith('--count=')) {
      const parsed = Number.parseInt(arg.slice('--count='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        count = parsed;
      }
    }
  }
  const resolvedTenant = tenantId ?? process.env.API_TENANT_ID ?? 'dev-tenant';
  return { tenantId: resolvedTenant, count };
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function buildRandomItem(tenantId: string): Item {
  const a = randomInt(40) + 10;
  const b = randomInt(40) + 5;
  const correctValue = a + b;

  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const jitter = randomInt(9) - 4; // range [-4, 4]
    const candidate = correctValue + jitter || correctValue + 1;
    if (candidate > 0 && candidate !== correctValue) {
      distractors.add(candidate);
    }
  }

  const choicePool = [correctValue, ...distractors];
  for (let i = choicePool.length - 1; i > 0; i -= 1) {
    const swapIndex = randomInt(i + 1);
    [choicePool[i], choicePool[swapIndex]] = [choicePool[swapIndex], choicePool[i]];
  }

  const correctIndex = choicePool.findIndex(value => value === correctValue);
  const now = new Date().toISOString();

  return {
    id: `random-item-${randomUUID()}`,
    tenantId,
    kind: 'MCQ',
    prompt: `What is ${a} + ${b}?`,
    choices: choicePool.map(value => ({ text: value.toString() })),
    correctIndex,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const { tenantId, count } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = createSQLiteTenantClient(config.persistence.sqlite);
  const db = client.getConnection(tenantId);

  try {
    const items: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const randomItem = buildRandomItem(tenantId);
      insertItem(db, randomItem);
      items.push(randomItem.id);
    }
    console.log(`Seeded ${items.length} random items for tenant "${tenantId}"`);
    console.log(items.join('\n'));
  } finally {
    client.closeAll();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
