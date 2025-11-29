import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../src/config/index.js';
import { createSQLiteTenantClient } from '../../src/infrastructure/sqlite/client.js';
import { insertAssessment, insertAttempt, insertItem } from '../../src/infrastructure/sqlite/seeds.js';
import type { Assessment, Attempt, ChoiceItem, EssayItem, FillBlankItem, HotspotItem, HotspotPoint, Item, MatchingItem, NumericEntryItem, OrderingItem, ShortAnswerItem } from '../../src/common/types.js';
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

function buildRandomMCQItem(tenantId: string): Item {
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

const trueFalseFacts = [
  { prompt: 'The Earth orbits the Sun.', answerIsTrue: true },
  { prompt: 'Sound travels faster than light.', answerIsTrue: false },
  { prompt: 'Water boils at 100°C at sea level.', answerIsTrue: true },
  { prompt: 'The human body has four lungs.', answerIsTrue: false },
];

function buildRandomTrueFalseItem(tenantId: string): Item {
  const fact = trueFalseFacts[randomInt(trueFalseFacts.length)];
  const now = new Date().toISOString();
  return {
    id: `random-tf-item-${randomUUID()}`,
    tenantId,
    kind: 'TRUE_FALSE',
    prompt: fact.prompt,
    choices: [{ text: 'True' }, { text: 'False' }],
    answerMode: 'single',
    correctIndexes: [fact.answerIsTrue ? 0 : 1],
    createdAt: now,
    updatedAt: now,
  };
}

const fillBlankTemplates: Array<{ prompt: string; answers: string[] | string[][] }> = [
  { prompt: '___ is the largest continent on Earth.', answers: ['Asia'] },
  { prompt: 'Light travels at approximately ___ km/s.', answers: ['300000', '300,000'] },
  {
    prompt: 'Name the two longest rivers: ___ and ___.',
    answers: [['Nile', 'Amazon'], ['Amazon', 'Nile']],
  },
];

function buildRandomFillBlankItem(tenantId: string): Item {
  const template = fillBlankTemplates[randomInt(fillBlankTemplates.length)];
  const now = new Date().toISOString();
  const firstEntry = (template.answers as any)[0];
  if (Array.isArray(firstEntry)) {
    const [firstSet] = template.answers as string[][];
    return {
      id: `random-fib-item-${randomUUID()}`,
      tenantId,
      kind: 'FILL_IN_THE_BLANK',
      prompt: template.prompt,
      blanks: firstSet.map((answer, index) => ({
        id: `blank-${index + 1}`,
        acceptableAnswers: [{ type: 'exact', value: answer, caseSensitive: false }],
      })),
      scoring: { mode: 'partial' },
      createdAt: now,
      updatedAt: now,
    } satisfies Item;
  }
  return {
    id: `random-fib-item-${randomUUID()}`,
    tenantId,
    kind: 'FILL_IN_THE_BLANK',
    prompt: template.prompt,
    blanks: [{
      id: 'blank-1',
      acceptableAnswers: (template.answers as string[]).map(answer => ({ type: 'exact', value: answer, caseSensitive: false })),
    }],
    scoring: { mode: 'all' },
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

const matchingTemplates = [
  {
    prompt: 'Match the country to its capital',
    pairs: [
      { prompt: 'France', target: 'Paris' },
      { prompt: 'Japan', target: 'Tokyo' },
      { prompt: 'Canada', target: 'Ottawa' },
    ],
    distractors: ['Berlin', 'Madrid'],
  },
  {
    prompt: 'Match the scientist to their discovery',
    pairs: [
      { prompt: 'Newton', target: 'Gravity' },
      { prompt: 'Einstein', target: 'Relativity' },
      { prompt: 'Curie', target: 'Radioactivity' },
    ],
    distractors: ['Evolution'],
  },
  {
    prompt: 'Match each planet to its order from the sun',
    pairs: [
      { prompt: 'Mercury', target: '1st' },
      { prompt: 'Earth', target: '3rd' },
      { prompt: 'Saturn', target: '6th' },
    ],
    distractors: ['2nd', '4th'],
  },
];

function buildRandomMatchingItem(tenantId: string): Item {
  const now = new Date().toISOString();
  const template = matchingTemplates[randomInt(matchingTemplates.length)];
  const targets = template.pairs.map((pair, index) => ({ id: `t-${index + 1}`, text: pair.target }));
  const extraTargets = template.distractors?.map((text, index) => ({ id: `t-extra-${index + 1}`, text })) ?? [];
  const prompts = template.pairs.map((pair, index) => ({ id: `p-${index + 1}`, text: pair.prompt, correctTargetId: targets[index].id }));
  return {
    id: `random-match-item-${randomUUID()}`,
    tenantId,
    kind: 'MATCHING',
    prompt: template.prompt,
    prompts,
    targets: [...targets, ...extraTargets],
    scoring: { mode: 'partial' },
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

const orderingTemplates = [
  {
    prompt: 'Rank the following planets from closest to farthest from the sun',
    options: ['Mercury', 'Venus', 'Earth', 'Mars'],
  },
  {
    prompt: 'Arrange the historical events chronologically',
    options: ['World War I', 'World War II', 'Moon Landing', 'Fall of Berlin Wall'],
  },
  {
    prompt: 'Order the data storage units from smallest to largest',
    options: ['Kilobyte', 'Megabyte', 'Gigabyte', 'Terabyte'],
  },
];

function buildRandomOrderingItem(tenantId: string): Item {
  const template = orderingTemplates[randomInt(orderingTemplates.length)];
  const options = template.options.map((text, index) => ({ id: `opt-${index + 1}`, text }));
  const correctOrder = options.map(option => option.id);
  const now = new Date().toISOString();
  const shouldAllowPartial = Math.random() > 0.5;
  return {
    id: `random-ordering-item-${randomUUID()}`,
    tenantId,
    kind: 'ORDERING',
    prompt: template.prompt,
    options,
    correctOrder,
    scoring: { mode: shouldAllowPartial ? 'partial_pairs' : 'all' },
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

const hotspotTemplates = [
  {
    prompt: 'Identify the continents that are highlighted on the map.',
    image: { url: 'https://example.com/maps/world-01.png', width: 1200, height: 675, alt: 'World map' },
    hotspots: [
      { id: 'americas', points: [{ x: 0.15, y: 0.25 }, { x: 0.32, y: 0.24 }, { x: 0.35, y: 0.6 }, { x: 0.18, y: 0.62 }] },
      { id: 'europe', points: [{ x: 0.55, y: 0.2 }, { x: 0.61, y: 0.2 }, { x: 0.63, y: 0.28 }, { x: 0.56, y: 0.32 }] },
    ],
    scoring: { mode: 'partial', maxSelections: 2 } as HotspotItem['scoring'],
  },
  {
    prompt: 'Tap the regions with active volcano clusters.',
    image: { url: 'https://example.com/maps/volcanoes.png', width: 1024, height: 768, alt: 'Volcano heatmap' },
    hotspots: [
      { id: 'ring-of-fire', points: [{ x: 0.12, y: 0.4 }, { x: 0.3, y: 0.35 }, { x: 0.35, y: 0.65 }, { x: 0.18, y: 0.7 }] },
      { id: 'mediterranean', points: [{ x: 0.52, y: 0.33 }, { x: 0.58, y: 0.31 }, { x: 0.6, y: 0.4 }, { x: 0.54, y: 0.42 }] },
      { id: 'iceland', points: [{ x: 0.48, y: 0.15 }, { x: 0.52, y: 0.15 }, { x: 0.53, y: 0.2 }, { x: 0.49, y: 0.2 }] },
    ],
    scoring: { mode: 'all', maxSelections: 3 } as HotspotItem['scoring'],
  },
  {
    prompt: 'Highlight the protected wildlife zones.',
    image: { url: 'https://example.com/maps/wildlife.png', width: 960, height: 540, alt: 'Wildlife reserves' },
    hotspots: [
      { id: 'savannah', points: [{ x: 0.4, y: 0.55 }, { x: 0.55, y: 0.5 }, { x: 0.53, y: 0.7 }, { x: 0.42, y: 0.72 }] },
      { id: 'rainforest', points: [{ x: 0.2, y: 0.45 }, { x: 0.3, y: 0.4 }, { x: 0.32, y: 0.58 }, { x: 0.22, y: 0.62 }] },
    ],
    scoring: { mode: 'partial', maxSelections: 2 } as HotspotItem['scoring'],
  },
];

function buildRandomHotspotItem(tenantId: string): Item {
  const template = hotspotTemplates[randomInt(hotspotTemplates.length)];
  const now = new Date().toISOString();
  return {
    id: `random-hotspot-item-${randomUUID()}`,
    tenantId,
    kind: 'HOTSPOT',
    prompt: template.prompt,
    image: template.image,
    hotspots: template.hotspots.map(region => ({
      id: `${region.id}-${randomUUID().slice(0, 6)}`,
      label: region.id.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
      points: region.points.map(point => ({ ...point })),
    })),
    scoring: template.scoring,
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

const shortAnswerTemplates = [
  {
    prompt: 'Explain how photosynthesis converts sunlight into chemical energy.',
    keywords: ['sunlight', 'chlorophyll', 'glucose'],
  },
  {
    prompt: 'Describe a mitigation strategy for distributed denial-of-service attacks.',
    keywords: ['rate limit', 'cdn', 'filtering'],
  },
  {
    prompt: 'Summarize the causes of the American Civil War.',
    keywords: ['slavery', 'states rights', 'secession'],
  },
];

function buildRandomShortAnswerItem(tenantId: string): Item {
  const template = shortAnswerTemplates[randomInt(shortAnswerTemplates.length)];
  const now = new Date().toISOString();
  const useAi = Math.random() > 0.6;
  const scoring = {
    mode: useAi ? 'ai_rubric' : 'manual',
    maxScore: useAi ? 5 : 3,
    aiEvaluatorId: useAi ? 'azure-openai-default' : undefined,
  } satisfies ShortAnswerItem['scoring'];
  const rubric = {
    keywords: template.keywords,
  } satisfies ShortAnswerItem['rubric'];
  return {
    id: `random-short-item-${randomUUID()}`,
    tenantId,
    kind: 'SHORT_ANSWER',
    prompt: template.prompt,
    rubric,
    scoring,
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

const essayTemplates = [
  {
    prompt: 'Discuss the societal implications of ubiquitous AI assistants.',
    keywords: ['ethics', 'privacy', 'productivity'],
  },
  {
    prompt: 'Explain how climate change affects coastal urban planning over 50 years.',
    keywords: ['sea level', 'infrastructure', 'migration'],
  },
  {
    prompt: 'Evaluate the impact of social media on political discourse.',
    keywords: ['polarization', 'engagement', 'misinformation'],
  },
];

function buildRandomEssayItem(tenantId: string): Item {
  const template = essayTemplates[randomInt(essayTemplates.length)];
  const now = new Date().toISOString();
  const maxScore = 12;
  const rubricSections = [
    { id: 'intro', title: 'Introduction', maxScore: 3 },
    { id: 'analysis', title: 'Analysis', maxScore: 5 },
    { id: 'conclusion', title: 'Conclusion', maxScore: 4 },
  ];
  const length = { minWords: 400, maxWords: 900, recommendedWords: 600 };
  return {
    id: `random-essay-item-${randomUUID()}`,
    tenantId,
    kind: 'ESSAY',
    prompt: template.prompt,
    rubric: { keywords: template.keywords, sections: rubricSections },
    length,
    scoring: { mode: 'manual', maxScore },
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

function buildRandomNumericItem(tenantId: string): Item {
  const now = new Date().toISOString();
  const useRange = Math.random() > 0.5;
  if (useRange) {
    const min = Number((Math.random() * 50 + 10).toFixed(1));
    const max = Number((min + Math.random() * 15 + 2).toFixed(1));
    return {
      id: `random-numeric-item-${randomUUID()}`,
      tenantId,
      kind: 'NUMERIC_ENTRY',
      prompt: 'Provide the measured temperature in °C.',
      validation: { mode: 'range', min, max },
      units: { label: 'Degrees Celsius', symbol: '°C', precision: 1 },
      createdAt: now,
      updatedAt: now,
    } satisfies Item;
  }
  const value = Number((Math.random() * 120 + 5).toFixed(2));
  const tolerance = Number((Math.random() * 1.5 + 0.1).toFixed(2));
  return {
    id: `random-numeric-item-${randomUUID()}`,
    tenantId,
    kind: 'NUMERIC_ENTRY',
    prompt: 'Report the circuit voltage in volts.',
    validation: { mode: 'exact', value, tolerance },
    units: { label: 'Volts', symbol: 'V', precision: 2 },
    createdAt: now,
    updatedAt: now,
  } satisfies Item;
}

function buildRandomItem(tenantId: string, index: number): Item {
  const builders = [
    buildRandomMCQItem,
    buildRandomTrueFalseItem,
    buildRandomFillBlankItem,
    buildRandomMatchingItem,
    buildRandomOrderingItem,
    buildRandomShortAnswerItem,
    buildRandomEssayItem,
    buildRandomNumericItem,
    buildRandomHotspotItem,
  ] as const;
  if (index < builders.length) {
    return builders[index](tenantId);
  }
  const roll = Math.random();
  if (roll < 0.12) return buildRandomFillBlankItem(tenantId);
  if (roll < 0.24) return buildRandomTrueFalseItem(tenantId);
  if (roll < 0.36) return buildRandomMatchingItem(tenantId);
  if (roll < 0.48) return buildRandomOrderingItem(tenantId);
  if (roll < 0.6) return buildRandomShortAnswerItem(tenantId);
  if (roll < 0.72) return buildRandomEssayItem(tenantId);
  if (roll < 0.84) return buildRandomNumericItem(tenantId);
  if (roll < 0.95) return buildRandomHotspotItem(tenantId);
  return buildRandomMCQItem(tenantId);
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

function pointCentroid(points: HotspotPoint[]): HotspotPoint {
  if (!points || points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  const count = points.length;
  return {
    x: Number((sum.x / count).toFixed(6)),
    y: Number((sum.y / count).toFixed(6)),
  };
}

function isPointInsidePolygon(point: HotspotPoint, polygon: HotspotPoint[]): boolean {
  if (!polygon || polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function buildRandomAttempt(
  tenantId: string,
  assessment: Assessment,
  itemById: Map<string, Item>,
): Attempt {
  const statuses: Attempt['status'][] = ['in_progress', 'submitted', 'scored'];
  let status = statuses[randomInt(statuses.length)];
  const now = new Date().toISOString();
  const containsFreeResponse = assessment.itemIds.some(itemId => {
    const item = itemById.get(itemId);
    return item ? isShortAnswerItem(item) || isEssayItem(item) : false;
  });
  if (containsFreeResponse && status === 'scored') {
    status = 'submitted';
  }
  const responses = assessment.itemIds.map(itemId => {
    const item = itemById.get(itemId);
    if (!item) {
      return { itemId };
    }
    if (isOrderingItem(item)) {
      const correct = item.correctOrder;
      const shuffled = Math.random() > 0.4 ? [...correct] : shuffle([...item.options.map(option => option.id)]);
      return { itemId, orderingAnswer: shuffled };
    }
    if (isMatchingItem(item)) {
      const answers = item.prompts.map(prompt => {
        const provideCorrect = Math.random() > 0.35;
        const fallbackTarget = item.targets[randomInt(item.targets.length)]?.id ?? prompt.correctTargetId;
        return {
          promptId: prompt.id,
          targetId: provideCorrect ? prompt.correctTargetId : fallbackTarget,
        };
      });
      return { itemId, matchingAnswers: answers };
    }
    if (isFillBlankItem(item)) {
      const answers = item.blanks.map(blank => {
        const provideCorrect = Math.random() > 0.3;
        if (!provideCorrect) {
          return `guess-${randomInt(100)}`;
        }
        const matcher = blank.acceptableAnswers.find(answer => answer.type === 'exact');
        return matcher ? matcher.value : 'example';
      });
      return { itemId, textAnswers: answers };
    }
    if (isShortAnswerItem(item)) {
      const responseText = Math.random() > 0.4
        ? 'Seasonal shifts occur because Earth is tilted on its axis.'
        : 'Need to research more before answering.';
      return { itemId, textAnswers: [responseText] };
    }
    if (isEssayItem(item)) {
      const paragraphs = [
        'Technological change often outpaces policy, forcing cities to rethink how residents live and work.',
        'Stakeholders must balance economic growth with sustainability and equity.',
      ];
      const essayText = paragraphs.join(' ');
      return { itemId, essayAnswer: essayText };
    }
    if (isNumericItem(item)) {
      const provideCorrect = Math.random() > 0.3;
      let value: number;
      if (provideCorrect) {
        if (item.validation.mode === 'exact') {
          const tolerance = item.validation.tolerance ?? 0;
          const offset = tolerance === 0 ? 0 : (Math.random() - 0.5) * tolerance * 0.9;
          value = Number((item.validation.value + offset).toFixed(3));
        } else {
          const span = item.validation.max - item.validation.min;
          value = Number((item.validation.min + Math.random() * span).toFixed(3));
        }
      } else if (item.validation.mode === 'exact') {
        value = Number((item.validation.value + ((item.validation.tolerance ?? 0.5) + 0.5) * 2).toFixed(3));
      } else {
        const pad = Math.max(1, (item.validation.max - item.validation.min) * 0.25);
        value = Math.random() > 0.5
          ? Number((item.validation.max + pad).toFixed(3))
          : Number((item.validation.min - pad).toFixed(3));
      }
      const preferredUnit = item.units?.symbol ?? item.units?.label;
      return { itemId, numericAnswer: { value, unit: preferredUnit } };
    }
    if (isHotspotItem(item)) {
      const selectionLimit = item.scoring.maxSelections ?? item.hotspots.length;
      const selectionBudget = Math.min(item.hotspots.length, Math.max(1, selectionLimit));
      if (selectionBudget === 0) {
        return { itemId };
      }
      const answers: HotspotPoint[] = [];
      for (let i = 0; i < selectionBudget; i += 1) {
        const provideCorrect = Math.random() > 0.35 && item.hotspots.length > 0;
        if (provideCorrect) {
          const region = item.hotspots[randomInt(item.hotspots.length)];
          answers.push(pointCentroid(region.points));
        } else {
          answers.push({
            x: Number(Math.random().toFixed(3)),
            y: Number(Math.random().toFixed(3)),
          });
        }
      }
      return { itemId, hotspotAnswers: answers };
    }
    if (isChoiceItem(item) && item.answerMode === 'single') {
      return { itemId, answerIndexes: [randomInt(item.choices.length)] };
    }
    const picks = new Set<number>();
    const choiceCount = isChoiceItem(item) ? item.choices.length : 0;
    const desired = Math.max(2, Math.min(choiceCount, randomInt(choiceCount) + 1));
    while (picks.size < desired && choiceCount > 0) {
      picks.add(randomInt(choiceCount));
    }
    return { itemId, answerIndexes: Array.from(picks) };
  });
  const maxScore = assessment.itemIds.reduce((total, itemId) => {
    const item = itemById.get(itemId);
    if (!item) return total;
    if (isOrderingItem(item)) {
      const optionCount = item.correctOrder.length;
      const pairScore = optionCount * (optionCount - 1) / 2;
      return item.scoring.mode === 'partial_pairs' ? total + pairScore : total + 1;
    }
    if (isMatchingItem(item)) {
      return item.scoring.mode === 'partial' ? total + item.prompts.length : total + 1;
    }
    if (isFillBlankItem(item) && item.scoring.mode === 'partial') {
      return total + item.blanks.length;
    }
    if (isShortAnswerItem(item)) {
      return total + (item.scoring?.maxScore ?? 1);
    }
    if (isEssayItem(item)) {
      return total + (item.scoring?.maxScore ?? 10);
    }
    if (isNumericItem(item)) {
      return total + 1;
    }
    if (isHotspotItem(item)) {
      if (item.hotspots.length === 0) {
        return total;
      }
      const selectionLimit = item.scoring.maxSelections ?? item.hotspots.length;
      const selectionBudget = Math.min(item.hotspots.length, Math.max(1, selectionLimit));
      return item.scoring.mode === 'partial' ? total + selectionBudget : total + 1;
    }
    return total + 1;
  }, 0);
  const score = status === 'scored'
    ? responses.reduce((total, response) => {
      const item = itemById.get(response.itemId);
      if (!item) return total;
      if (isShortAnswerItem(item) || isEssayItem(item)) {
        return total;
      }
      if (isFillBlankItem(item)) {
        const provided = response.textAnswers ?? [];
        const blanksCorrect = item.blanks.reduce((count, blank, index) => {
          const candidate = provided[index];
          if (!candidate) return count;
          const matcher = blank.acceptableAnswers[0];
          if (!matcher) return count;
          if (matcher.type === 'exact' && matcher.value.localeCompare(candidate, undefined, { sensitivity: matcher.caseSensitive ? 'case' : 'accent' }) === 0) {
            return count + 1;
          }
          return count;
        }, 0);
        if (item.scoring.mode === 'partial') {
          return total + blanksCorrect;
        }
        return blanksCorrect === item.blanks.length && item.blanks.length > 0 ? total + 1 : total;
      }
      if (isMatchingItem(item)) {
        const provided = response.matchingAnswers ?? [];
        const correctByPrompt = new Map(item.prompts.map(prompt => [prompt.id, prompt.correctTargetId] as const));
        const matches = provided.reduce((count, pair) => {
          const expected = correctByPrompt.get(pair.promptId);
          return expected && expected === pair.targetId ? count + 1 : count;
        }, 0);
        if (item.scoring.mode === 'partial') {
          return total + matches;
        }
        return matches === item.prompts.length && item.prompts.length > 0 ? total + 1 : total;
      }
      if (isOrderingItem(item)) {
        if (item.scoring.customEvaluatorId) {
          return total; // defer to external scorer
        }
        const provided = response.orderingAnswer ?? [];
        if (item.scoring.mode === 'all') {
          const isCorrect = provided.length === item.correctOrder.length
            && item.correctOrder.every((optionId, index) => optionId === provided[index]);
          return isCorrect ? total + 1 : total;
        }
        const expectedIndex = new Map(item.correctOrder.map((optionId, index) => [optionId, index] as const));
        const providedIndex = new Map(provided.map((optionId, index) => [optionId, index] as const));
        let correctPairs = 0;
        for (let i = 0; i < item.correctOrder.length; i += 1) {
          for (let j = i + 1; j < item.correctOrder.length; j += 1) {
            const first = item.correctOrder[i];
            const second = item.correctOrder[j];
            const posFirst = providedIndex.get(first);
            const posSecond = providedIndex.get(second);
            if (posFirst === undefined || posSecond === undefined) {
              continue;
            }
            if (posFirst < posSecond) {
              correctPairs += 1;
            }
          }
        }
        return total + correctPairs;
      }
      if (isNumericItem(item)) {
        const provided = response.numericAnswer?.value;
        if (typeof provided !== 'number' || Number.isNaN(provided)) {
          return total;
        }
        if (item.validation.mode === 'exact') {
          const tolerance = item.validation.tolerance ?? 0;
          const delta = Math.abs(provided - item.validation.value);
          return delta <= tolerance ? total + 1 : total;
        }
        return provided >= item.validation.min && provided <= item.validation.max ? total + 1 : total;
      }
      if (isHotspotItem(item)) {
        if (item.hotspots.length === 0) {
          return total;
        }
        const selectionLimit = item.scoring.maxSelections ?? item.hotspots.length;
        const selectionBudget = Math.min(item.hotspots.length, Math.max(1, selectionLimit));
        const provided = (response.hotspotAnswers ?? []).slice(0, selectionBudget);
        if (provided.length === 0) {
          return total;
        }
        const matched = new Set<string>();
        for (const answer of provided) {
          const region = item.hotspots.find(hotspot => isPointInsidePolygon(answer, hotspot.points));
          if (region) {
            matched.add(region.id);
          }
        }
        if (item.scoring.mode === 'partial') {
          return total + matched.size;
        }
        return matched.size === item.hotspots.length ? total + 1 : total;
      }
      if (!isChoiceItem(item) || !response.answerIndexes || response.answerIndexes.length === 0) {
        return total;
      }
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
      items.push(insertItem(db, buildRandomItem(options.tenantId, i)));
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
