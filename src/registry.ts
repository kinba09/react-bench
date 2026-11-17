import type { BenchmarkConfig, DynamicTrackingConfig, DynamicTrackingLevel, Level, MovingObject, Scenario, VisualReactionConfig, VisualReactionScenario } from './types.js';

export const defaultConfig: VisualReactionConfig = {
  category: 'visual-reaction', seed: 'reactbench-v1', levels: [1, 2, 3, 4, 5],
  trialsPerLevel: 3, screenshotsPerSecond: 2,
  initialDelayMs: [1000, 4000], responseWindowsMs: [5000, 4000, 3000, 2000, 1000],
};
export const defaultDynamicTrackingConfig: DynamicTrackingConfig = {
  category: 'dynamic-tracking', seed: 'reactbench-v1', levels: [1, 2, 3],
  trialsPerLevel: 3, screenshotsPerSecond: 2, clickWindowMs: 10_000, initialDelayMs: [1000, 4000],
};
export const dynamicTrackingTargetRadiusPx = 24;
export const dynamicTrackingSpeedPxPerSecond = 150;
export const dynamicTrackingReferenceBandPx = 68;
export const dynamicTrackingObjectCounts: Record<DynamicTrackingLevel, number> = { 1: 1, 2: 5, 3: 15 };
export const visualReaction = {
  id: 'visual-reaction' as const,
  title: 'Visual Reaction',
  instructions: 'Wait while the target is red. Click the target once it turns green. One click only; early or incorrect clicks fail.',
};
export const dynamicTracking = {
  id: 'dynamic-tracking' as const,
  title: 'Dynamic Tracking',
  instructions: 'Find the star shown in the reference and click it once while it moves. Other objects are distractors. One click only.',
};
export function instructionsForScenario(scenario: Scenario): string {
  return scenario.category === 'dynamic-tracking' ? dynamicTracking.instructions : visualReaction.instructions;
}

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

export function validateConfig(input: unknown): BenchmarkConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object.');
  const config = input as Record<string, unknown>;
  const category = config.category;
  if (category !== 'visual-reaction' && category !== 'dynamic-tracking') throw new Error('category must be visual-reaction or dynamic-tracking.');
  const keys = category === 'visual-reaction' ? Object.keys(defaultConfig) : Object.keys(defaultDynamicTrackingConfig);
  for (const key of Object.keys(config)) if (!keys.includes(key)) throw new Error(`Unknown configuration option: ${key}`);
  if (typeof config.seed !== 'string' || !config.seed.length || config.seed.length > 200) throw new Error('seed must be a nonempty string of at most 200 characters.');
  const levels = config.levels;
  const maxLevel = category === 'dynamic-tracking' ? 3 : 5;
  if (!Array.isArray(levels) || !levels.length || levels.some(x => !Number.isInteger(x) || x < 1 || x > maxLevel) || new Set(levels).size !== levels.length) throw new Error(`levels must contain unique integers from 1 to ${maxLevel}.`);
  if (!Number.isInteger(config.trialsPerLevel) || Number(config.trialsPerLevel) < 1 || Number(config.trialsPerLevel) > 1000) throw new Error('trialsPerLevel must be an integer from 1 to 1000.');
  if (typeof config.screenshotsPerSecond !== 'number' || !Number.isFinite(config.screenshotsPerSecond) || config.screenshotsPerSecond < 0.1 || config.screenshotsPerSecond > 30) throw new Error('screenshotsPerSecond must be between 0.1 and 30.');
  const delay = config.initialDelayMs ?? (category === 'dynamic-tracking' ? defaultConfig.initialDelayMs : undefined);
  if (!Array.isArray(delay) || delay.length !== 2 || delay.some(x => !Number.isFinite(x) || x < 100 || x > 60_000) || delay[0] > delay[1]) throw new Error('initialDelayMs must be an ordered pair between 100 and 60000 milliseconds.');
  if (category === 'dynamic-tracking') {
    if (!Number.isFinite(config.clickWindowMs) || Number(config.clickWindowMs) < 100 || Number(config.clickWindowMs) > 60_000) throw new Error('clickWindowMs must be between 100 and 60000 milliseconds.');
    return { ...structuredClone(input), initialDelayMs: [...delay] } as DynamicTrackingConfig;
  }
  const windows = config.responseWindowsMs;
  if (!Array.isArray(windows) || windows.length !== 5 || windows.some(x => !Number.isFinite(x) || x < 100 || x > 60_000)) throw new Error('responseWindowsMs must contain five durations between 100 and 60000 milliseconds.');
  return structuredClone(input) as BenchmarkConfig;
}

function createMovingObjects(seed: string, count: number): MovingObject[] {
  const random = randomFrom(seed);
  const slots = Array.from({ length: 15 }, (_, index) => index);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  return slots.slice(0, count).map((slot, index) => {
    const angle = random() * Math.PI * 2;
    const speed = dynamicTrackingSpeedPxPerSecond;
    return {
      id: index === 0 ? 'required-star' : `distractor-${index}`,
      role: index === 0 ? 'required' : 'distractor',
      u: 0.1 + (slot % 5) * 0.2 + random() * 0.025,
      v: 0.12 + Math.floor(slot / 5) * 0.34 + random() * 0.04,
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
  if (config.category === 'dynamic-tracking') {
    for (const level of config.levels) {
      for (let repetition = 1; repetition <= config.trialsPerLevel; repetition++) {
        const seed = `${config.seed}/dynamic-tracking/${level}/${repetition}`;
        const objectCount = dynamicTrackingObjectCounts[level];
        trials.push({ id: `dynamic-tracking-l${level}-t${repetition}`, category: 'dynamic-tracking', seed,
          level, repetition, clickWindowMs: config.clickWindowMs,
          initialDelayMs: Math.round((config.initialDelayMs ?? defaultConfig.initialDelayMs)[0] + randomFrom(`${seed}/delay`)() * ((config.initialDelayMs ?? defaultConfig.initialDelayMs)[1] - (config.initialDelayMs ?? defaultConfig.initialDelayMs)[0])),
          requiredTargetId: 'required-star',
          objects: createMovingObjects(seed, objectCount) });
      }
    }
  } else {
    for (const level of config.levels) {
      for (let repetition = 1; repetition <= config.trialsPerLevel; repetition++) {
        const seed = `${config.seed}/visual-reaction/${level}/${repetition}`;
        const trialRandom = randomFrom(seed);
        const scenario: VisualReactionScenario = { id: `visual-reaction-l${level}-t${repetition}`, category: 'visual-reaction', seed,
          level: level as Level, repetition,
          initialDelayMs: Math.round(config.initialDelayMs[0] + trialRandom() * (config.initialDelayMs[1] - config.initialDelayMs[0])),
          responseWindowMs: config.responseWindowsMs[level - 1]!,
          target: { u: 0.2 + trialRandom() * 0.6, v: 0.2 + trialRandom() * 0.6, radius: 42 } };
        trials.push(scenario);
      }
    }
  }
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [trials[i], trials[j]] = [trials[j]!, trials[i]!];
  }
  return trials;
}
