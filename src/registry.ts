import type { BenchmarkConfig, Category, Level, Scenario, TargetAcquisitionConfig, TargetSymbol, VisualReactionConfig } from './types.js';

export const defaultConfig: VisualReactionConfig = {
  category: 'visual-reaction', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 3, screenshotsPerSecond: 2,
  initialDelayMs: [1000, 4000], responseWindowsMs: [5000, 4000, 3000, 2000, 1000],
};
export const targetAcquisitionConfig: TargetAcquisitionConfig = {
  category: 'target-acquisition', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 3, screenshotsPerSecond: 2,
};

export const visualReaction = {
  id: 'visual-reaction' as const,
  title: 'Visual Reaction',
  instructions: 'Wait while the target is red. Click the target once it turns green. One click only; early or incorrect clicks fail.',
};
export const targetAcquisition = {
  id: 'target-acquisition' as const,
  title: 'Target Acquisition',
  instructions: 'Wait for “Find the match,” then click the object that matches the reference symbol once before time runs out.',
};
export const taskRegistry = {
  'visual-reaction': visualReaction,
  'target-acquisition': targetAcquisition,
} satisfies Record<Category, { id: Category; title: string; instructions: string }>;

export const targetAcquisitionObjectsByLevel = [6, 16, 36, 64, 100] as const;
const acquisitionObjectSizePx = 26 as const;
const symbols: TargetSymbol[] = ['triangle', 'circle', 'square', 'diamond', 'star', 'cross', 'hexagon', 'crescent', 'heart', 'flower'];

function randomFrom(seed: string): () => number {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.codePointAt(0)!, 16777619);
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ value >>> 15, value | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle<T>(values: T[], random: () => number): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
}

export function defaultConfigFor(category: Category): BenchmarkConfig {
  return category === 'visual-reaction' ? structuredClone(defaultConfig) : structuredClone(targetAcquisitionConfig);
}

export function validateConfig(input: unknown): BenchmarkConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object.');
  const config = input as Record<string, unknown>;
  if (config.category !== 'visual-reaction' && config.category !== 'target-acquisition') throw new Error('category must be visual-reaction or target-acquisition.');
  const keys = ['category', 'seed', 'levels', 'trialsPerLevel', 'screenshotsPerSecond',
    ...(config.category === 'visual-reaction' ? ['initialDelayMs', 'responseWindowsMs'] : [])];
  for (const key of Object.keys(config)) if (!keys.includes(key)) throw new Error(`Unknown configuration option: ${key}`);
  if (typeof config.seed !== 'string' || !config.seed.length || config.seed.length > 200) throw new Error('seed must be a nonempty string of at most 200 characters.');
  const levels = config.levels;
  if (!Array.isArray(levels) || !levels.length || levels.some(x => !Number.isInteger(x) || x < 1 || x > 5) || new Set(levels).size !== levels.length) throw new Error('levels must contain unique integers from 1 to 5.');
  if (!Number.isInteger(config.trialsPerLevel) || Number(config.trialsPerLevel) < 1 || Number(config.trialsPerLevel) > 1000) throw new Error('trialsPerLevel must be an integer from 1 to 1000.');
  if (typeof config.screenshotsPerSecond !== 'number' || !Number.isFinite(config.screenshotsPerSecond) || config.screenshotsPerSecond < 0.1 || config.screenshotsPerSecond > 30) throw new Error('screenshotsPerSecond must be between 0.1 and 30.');

  if (config.category === 'visual-reaction') {
    const delay = config.initialDelayMs;
    if (!Array.isArray(delay) || delay.length !== 2 || delay.some(x => !Number.isFinite(x) || x < 100 || x > 60_000) || delay[0] > delay[1]) throw new Error('initialDelayMs must be an ordered pair between 100 and 60000 milliseconds.');
    const windows = config.responseWindowsMs;
    if (!Array.isArray(windows) || windows.length !== 5 || windows.some(x => !Number.isFinite(x) || x < 100 || x > 60_000)) throw new Error('responseWindowsMs must contain five durations between 100 and 60000 milliseconds.');
  }
  return structuredClone(input) as BenchmarkConfig;
}

function createTargetAcquisitionTrial(seed: string, level: Level, repetition: number): Scenario {
  const random = randomFrom(seed);
  const count = targetAcquisitionObjectsByLevel[level - 1]!;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: count }, (_, index) => ({
    u: ((index % columns) + 0.5) / columns,
    v: (Math.floor(index / columns) + 0.5) / rows,
  }));
  shuffle(cells, random);
  const matchingIndex = Math.floor(random() * count);
  const symbol = symbols[Math.floor(random() * symbols.length)]!;
  const distractors = symbols.filter(item => item !== symbol);
  const objects = cells.map((cell, index) => ({
    id: `object-${index + 1}`,
    u: cell.u + (random() - 0.5) * 0.008,
    v: cell.v + (random() - 0.5) * 0.014,
    symbol: index === matchingIndex ? symbol : distractors[Math.floor(random() * distractors.length)]!,
    matching: index === matchingIndex,
  }));
  return { id: `target-acquisition-l${level}-t${repetition}`, category: 'target-acquisition', seed,
    level, repetition, responseWindowMs: 10_000, objectSizePx: acquisitionObjectSizePx,
    reference: { symbol }, objects };
}

export function createPlan(input: BenchmarkConfig): Scenario[] {
  const config = validateConfig(input);
  const random = randomFrom(config.seed);
  const trials: Scenario[] = [];
  for (const level of config.levels) {
    for (let repetition = 1; repetition <= config.trialsPerLevel; repetition++) {
      const seed = `${config.seed}/${config.category}/${level}/${repetition}`;
      if (config.category === 'target-acquisition') {
        trials.push(createTargetAcquisitionTrial(seed, level as Level, repetition));
      } else {
        const trialRandom = randomFrom(seed);
        trials.push({ id: `visual-reaction-l${level}-t${repetition}`, category: 'visual-reaction', seed,
          level: level as Level, repetition,
          initialDelayMs: Math.round(config.initialDelayMs[0] + trialRandom() * (config.initialDelayMs[1] - config.initialDelayMs[0])),
          responseWindowMs: config.responseWindowsMs[level - 1]!,
          target: { u: 0.2 + trialRandom() * 0.6, v: 0.2 + trialRandom() * 0.6, radius: 42 },
        });
      }
    }
  }
  shuffle(trials, random);
  return trials;
}
