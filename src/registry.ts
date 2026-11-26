import type { BenchmarkConfig, Category, DynamicTrackingConfig, DynamicTrackingLevel, InhibitoryControlConfig, InhibitoryControlCondition, InhibitoryControlScenario, Level, MovingObject, Scenario, TargetAcquisitionConfig, TargetSymbol, VisualReactionConfig } from './types.js';

export const defaultConfig: VisualReactionConfig = {
  category: 'visual-reaction', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 3,
  initialDelayMs: [1000, 4000], responseWindowsMs: [5000, 4000, 3000, 2000, 1000],
};
export const targetAcquisitionConfig: TargetAcquisitionConfig = {
  category: 'target-acquisition', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 3, initialDelayMs: [1000, 4000],
};

export const defaultDynamicTrackingConfig: DynamicTrackingConfig = {
  category: 'dynamic-tracking', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 3, clickWindowMs: 10_000, initialDelayMs: [1000, 4000],
};
export const defaultInhibitoryControlConfig: InhibitoryControlConfig = {
  category: 'inhibitory-control', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 1, initialDelayMs: [1000, 4000],
  responseWindowsMs: [5000, 4000, 3000, 2000, 1000],
};
export const inhibitoryControlConditions = ['go', 'no-go', 'delayed-stop'] as const satisfies readonly InhibitoryControlCondition[];
const nominalStopDelaysMs: Record<Level, number> = { 1: 100, 2: 250, 3: 400, 4: 550, 5: 700 };
export const dynamicTrackingTargetRadiusPx = 24;
export const dynamicTrackingSpeedPxPerSecond = 150;
export const dynamicTrackingReferenceBandPx = 68;
export const dynamicTrackingObjectCounts: Record<DynamicTrackingLevel, number> = { 1: 1, 2: 5, 3: 15, 4: 30, 5: 60 };
export const dynamicTrackingWatchDurationMs = 1500;
export const dynamicTrackingHiddenDurationMs: Record<4 | 5, number> = { 4: 1000, 5: 2000 };
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
export const dynamicTracking = {
  id: 'dynamic-tracking' as const,
  title: 'Dynamic Tracking',
  instructions: 'Find the star shown in the reference and click it once while it moves. Other objects are distractors. One click only.',
};
export const inhibitoryControl = {
  id: 'inhibitory-control' as const,
  title: 'Inhibitory Control',
  instructions: 'Click once on green and withhold on red. Some trials start green and switch to a red stop cue. On those trials, withhold for the entire response window.',
};
export const taskRegistry = {
  'visual-reaction': visualReaction,
  'target-acquisition': targetAcquisition,
  'dynamic-tracking': dynamicTracking,
  'inhibitory-control': inhibitoryControl,
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
function opaqueTrialId(seed: string): string {
  const random = randomFrom(`${seed}/id`);
  const suffix = Array.from({ length: 3 }, () => Math.floor(random() * 0x1_0000_0000).toString(16).padStart(8, '0')).join('');
  return `inhibitory-control-${suffix}`;
}

export function defaultConfigFor(category: Category): BenchmarkConfig {
  if (category === 'dynamic-tracking') return structuredClone(defaultDynamicTrackingConfig);
  if (category === 'inhibitory-control') return structuredClone(defaultInhibitoryControlConfig);
  return category === 'visual-reaction' ? structuredClone(defaultConfig) : structuredClone(targetAcquisitionConfig);
}

export function validateConfig(input: unknown): BenchmarkConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object.');
  const config = input as Record<string, unknown>;
  const category = config.category;
  if (category !== 'visual-reaction' && category !== 'target-acquisition' && category !== 'dynamic-tracking' && category !== 'inhibitory-control') throw new Error('category must be visual-reaction, target-acquisition, dynamic-tracking, or inhibitory-control.');
  const keys = ['category', 'seed', 'levels', 'trialsPerLevel',
    'initialDelayMs', ...(category === 'visual-reaction' || category === 'inhibitory-control' ? ['responseWindowsMs'] : category === 'dynamic-tracking' ? ['clickWindowMs'] : []),
    ...(category === 'inhibitory-control' ? ['conditions'] : [])];
  for (const key of Object.keys(config)) if (!keys.includes(key)) throw new Error(`Unknown configuration option: ${key}`);
  if (typeof config.seed !== 'string' || !config.seed.length || config.seed.length > 200) throw new Error('seed must be a nonempty string of at most 200 characters.');
  const levels = config.levels;
  const maxLevel = 5;
  if (!Array.isArray(levels) || !levels.length || levels.some(x => !Number.isInteger(x) || x < 1 || x > maxLevel) || new Set(levels).size !== levels.length) throw new Error(`levels must contain unique integers from 1 to ${maxLevel}.`);
  if (!Number.isInteger(config.trialsPerLevel) || Number(config.trialsPerLevel) < 1 || Number(config.trialsPerLevel) > 1000) throw new Error('trialsPerLevel must be an integer from 1 to 1000.');

  const delay = config.initialDelayMs ?? (category === 'visual-reaction' ? undefined : defaultConfig.initialDelayMs);
  if (!Array.isArray(delay) || delay.length !== 2 || delay.some(x => !Number.isFinite(x) || x < 100 || x > 60_000) || delay[0] > delay[1]) throw new Error('initialDelayMs must be an ordered pair between 100 and 60000 milliseconds.');
  if (category === 'dynamic-tracking' && (!Number.isFinite(config.clickWindowMs) || Number(config.clickWindowMs) < 100 || Number(config.clickWindowMs) > 60_000)) throw new Error('clickWindowMs must be between 100 and 60000 milliseconds.');
  if (category === 'visual-reaction' || category === 'inhibitory-control') {
    const windows = config.responseWindowsMs;
    if (!Array.isArray(windows) || windows.length !== 5 || windows.some(x => !Number.isFinite(x) || x < 100 || x > 60_000)) throw new Error('responseWindowsMs must contain five durations between 100 and 60000 milliseconds.');
    if (category === 'inhibitory-control') {
      const conditions = config.conditions === undefined ? inhibitoryControlConditions : config.conditions;
      if (!Array.isArray(conditions) || !conditions.length || conditions.some(condition => !inhibitoryControlConditions.includes(condition))
        || new Set(conditions).size !== conditions.length) {
        throw new Error('conditions must contain unique values from go, no-go, and delayed-stop.');
      }
      if (conditions.includes('delayed-stop')) {
        for (const level of levels as Level[]) {
          if (windows[level - 1] <= nominalStopDelaysMs[level] * 1.2) {
            throw new Error(`Level ${level} response window must exceed the delayed-stop range. Increase the window or omit delayed-stop from conditions.`);
          }
        }
      }
    }
  }
  return { ...structuredClone(input), initialDelayMs: [...delay] } as BenchmarkConfig;
}

function createTargetAcquisitionTrial(seed: string, level: Level, repetition: number, initialDelayMs: number): Scenario {
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
    level, repetition, initialDelayMs, responseWindowMs: 10_000, objectSizePx: acquisitionObjectSizePx,
    reference: { symbol }, objects };
}

function createMovingObjects(seed: string, count: number): MovingObject[] {
  const random = randomFrom(seed);
  const columns = count <= 15 ? 5 : Math.ceil(Math.sqrt(count * (1120 / (310 - dynamicTrackingReferenceBandPx))));
  const rows = Math.ceil(count / columns);
  const slots = Array.from({ length: count <= 15 ? 15 : count }, (_, index) => index);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  return slots.slice(0, count).map((slot, index) => {
    const angle = random() * Math.PI * 2;
    const speed = dynamicTrackingSpeedPxPerSecond;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const u = count <= 15 ? 0.1 + column * 0.2 + random() * 0.025
      : 0.08 + column * (0.84 / Math.max(1, columns - 1)) + (random() - 0.5) * (0.02 / columns);
    const v = count <= 15 ? 0.12 + row * 0.34 + random() * 0.04
      : 0.12 + row * (0.76 / Math.max(1, rows - 1)) + (random() - 0.5) * (0.025 / rows);
    return {
      id: index === 0 ? 'required-star' : `distractor-${index}`,
      role: index === 0 ? 'required' : 'distractor',
      u,
      v,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      radius: dynamicTrackingTargetRadiusPx,
    };
  });
}

export function createPlan(input: BenchmarkConfig): Scenario[] {
  const config = validateConfig(input);
  const random = randomFrom(config.seed);
  const trials: Scenario[] = [];
  for (const level of config.levels) {
    for (let repetition = 1; repetition <= config.trialsPerLevel; repetition++) {
      const seed = `${config.seed}/${config.category}/${level}/${repetition}`;
      const delay = config.initialDelayMs ?? defaultConfig.initialDelayMs;
      const initialDelayMs = Math.round(delay[0] + randomFrom(`${seed}/delay`)() * (delay[1] - delay[0]));
      if (config.category === 'dynamic-tracking') {
        trials.push({ id: `dynamic-tracking-l${level}-t${repetition}`, category: 'dynamic-tracking', seed,
          level: level as DynamicTrackingLevel, repetition, clickWindowMs: config.clickWindowMs, initialDelayMs: level >= 4 ? 0 : initialDelayMs,
          watchDurationMs: level >= 4 ? dynamicTrackingWatchDurationMs : 0,
          hiddenDurationMs: level >= 4 ? dynamicTrackingHiddenDurationMs[level as 4 | 5] : 0,
          requiredTargetId: 'required-star', objects: createMovingObjects(seed, dynamicTrackingObjectCounts[level as DynamicTrackingLevel]) });
      } else if (config.category === 'target-acquisition') {
        trials.push(createTargetAcquisitionTrial(seed, level as Level, repetition, initialDelayMs));
      } else if (config.category === 'inhibitory-control') {
        for (const condition of config.conditions ?? inhibitoryControlConditions) {
          const conditionSeed = `${seed}/${condition}`;
          const trialRandom = randomFrom(conditionSeed);
          const base = { id: opaqueTrialId(conditionSeed),
            category: 'inhibitory-control' as const, seed: conditionSeed, level, repetition,
            initialDelayMs: Math.round(delay[0] + trialRandom() * (delay[1] - delay[0])),
            responseWindowMs: config.responseWindowsMs[level - 1]!,
            target: { u: 0.2 + trialRandom() * 0.6, v: 0.2 + trialRandom() * 0.6, radius: 42 },
          };
          let trial: InhibitoryControlScenario;
          if (condition === 'delayed-stop') {
            const nominalStopDelayMs = nominalStopDelaysMs[level];
            const randomStop = randomFrom(`${conditionSeed}/stop-delay`);
            const plannedStopDelayMs = nominalStopDelayMs * (0.8 + randomStop() * 0.4);
            trial = { ...base, condition, nominalStopDelayMs, plannedStopDelayMs };
          } else {
            trial = { ...base, condition };
          }
          trials.push(trial);
        }
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
