import { createPlan, defaultConfig, defaultConfigFor, targetAcquisitionObjectsByLevel, taskRegistry } from './registry.js';
import { grade } from './grader.js';
import type { BrowserEnvironment, BrowserEvent, Category, Scenario, SceneSnapshot, TargetSymbol } from './types.js';

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const context = canvas.getContext('2d')!;
const status = document.querySelector<HTMLElement>('#status')!;
const instruction = document.querySelector<HTMLElement>('#instruction')!;
const progress = document.querySelector<HTMLElement>('#progress')!;
const levelLabel = document.querySelector<HTMLElement>('#level-label')!;
const result = document.querySelector<HTMLElement>('#result')!;
const reference = document.querySelector<HTMLElement>('#reference')!;
const referenceSymbol = document.querySelector<HTMLCanvasElement>('#reference-symbol')!;
const responseWindowLabel = document.querySelector<HTMLElement>('#window-label')!;
const categoryTitle = document.querySelector<HTMLElement>('#category-title')!;
const categorySubtitle = document.querySelector<HTMLElement>('#category-subtitle')!;
const targetAcquisitionReadyMs = 250;
const controlled = new URLSearchParams(location.search).has('controlled');
document.querySelector<HTMLElement>('#practice-controls')!.hidden = controlled;
const access = new URLSearchParams(location.search).get('access');
document.querySelector<HTMLElement>('#mode')!.textContent = !controlled ? 'Local practice'
  : access === 'privileged-oracle' ? 'Oracle control baseline' : 'Visual agent evaluation';
let scenario: Scenario;
let phase: SceneSnapshot['phase'] = 'prepared';
let events: BrowserEvent[] = [];
let target = { x: 0, y: 0, radius: 42 };
let objects: SceneSnapshot['objects'] = [];
let referenceValue: SceneSnapshot['reference'] = null;
let plannedActivation = 0;
let deadline = 0;
let animation = 0;

function drawSymbol(targetContext: CanvasRenderingContext2D, symbol: TargetSymbol, x: number, y: number, size: number): void {
  targetContext.save();
  targetContext.translate(x, y);
  targetContext.fillStyle = '#273443';
  targetContext.beginPath();
  const radius = size * 0.39;
  if (symbol === 'circle') {
    targetContext.arc(0, 0, radius, 0, Math.PI * 2);
  } else if (symbol === 'square') {
    targetContext.rect(-radius * 0.75, -radius * 0.75, radius * 1.5, radius * 1.5);
  } else if (symbol === 'triangle' || symbol === 'diamond' || symbol === 'hexagon' || symbol === 'star') {
    const count = symbol === 'triangle' ? 3 : symbol === 'diamond' ? 4 : symbol === 'hexagon' ? 6 : 10;
    for (let index = 0; index < count; index++) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      const pointRadius = symbol === 'star' && index % 2 === 1 ? radius * 0.48 : radius;
      const pointX = Math.cos(angle) * pointRadius;
      const pointY = Math.sin(angle) * pointRadius;
      if (!index) targetContext.moveTo(pointX, pointY); else targetContext.lineTo(pointX, pointY);
    }
    targetContext.closePath();
  } else if (symbol === 'cross') {
    const arm = radius * 0.38;
    const reach = radius;
    targetContext.moveTo(-arm, -reach); targetContext.lineTo(arm, -reach);
    targetContext.lineTo(arm, -arm); targetContext.lineTo(reach, -arm);
    targetContext.lineTo(reach, arm); targetContext.lineTo(arm, arm);
    targetContext.lineTo(arm, reach); targetContext.lineTo(-arm, reach);
    targetContext.lineTo(-arm, arm); targetContext.lineTo(-reach, arm);
    targetContext.lineTo(-reach, -arm); targetContext.lineTo(-arm, -arm);
    targetContext.closePath();
  } else if (symbol === 'crescent') {
    targetContext.arc(0, 0, radius, 0, Math.PI * 2);
    targetContext.arc(radius * 0.48, -radius * 0.24, radius * 0.82, 0, Math.PI * 2, true);
    targetContext.fill('evenodd');
    targetContext.restore();
    return;
  } else if (symbol === 'heart') {
    targetContext.moveTo(0, radius * 0.88);
    targetContext.bezierCurveTo(-radius * 0.1, radius * 0.72, -radius * 1.1, radius * 0.1, -radius * 0.9, -radius * 0.42);
    targetContext.bezierCurveTo(-radius * 0.73, -radius * 0.95, -radius * 0.15, -radius * 0.86, 0, -radius * 0.42);
    targetContext.bezierCurveTo(radius * 0.15, -radius * 0.86, radius * 0.73, -radius * 0.95, radius * 0.9, -radius * 0.42);
    targetContext.bezierCurveTo(radius * 1.1, radius * 0.1, radius * 0.1, radius * 0.72, 0, radius * 0.88);
  } else if (symbol === 'flower') {
    const petal = radius * 0.42;
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3;
      targetContext.moveTo(Math.cos(angle) * radius * 0.56 + petal, Math.sin(angle) * radius * 0.56);
      targetContext.arc(Math.cos(angle) * radius * 0.56, Math.sin(angle) * radius * 0.56, petal, 0, Math.PI * 2);
    }
    targetContext.moveTo(radius * 0.27, 0);
    targetContext.arc(0, 0, radius * 0.27, 0, Math.PI * 2);
  }
  targetContext.fill();
  targetContext.restore();
}

function paintReference(symbol: TargetSymbol): void {
  referenceSymbol.width = 40;
  referenceSymbol.height = 40;
  referenceSymbol.setAttribute('aria-label', `Reference shape: ${symbol}`);
  const referenceContext = referenceSymbol.getContext('2d')!;
  referenceContext.clearRect(0, 0, referenceSymbol.width, referenceSymbol.height);
  drawSymbol(referenceContext, symbol, 20, 20, 27);
}

function draw(): void {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (scenario.category === 'visual-reaction') {
    target = { x: rect.left + rect.width * scenario.target.u,
      y: rect.top + rect.height * scenario.target.v, radius: scenario.target.radius };
    objects = [];
    referenceValue = null;
    context.beginPath();
    context.arc(target.x - rect.left, target.y - rect.top, target.radius, 0, Math.PI * 2);
    context.fillStyle = phase === 'active' ? '#15804c' : phase === 'complete' ? '#7c8591' : '#cc423a';
    context.fill();
    context.beginPath();
    context.arc(target.x - rect.left, target.y - rect.top, 4, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    return;
  }

  const radius = scenario.objectSizePx / 2;
  objects = scenario.objects.map(item => ({ id: item.id, x: rect.left + rect.width * item.u,
    y: rect.top + rect.height * item.v, radius, symbol: item.symbol, matching: item.matching }));
  const matching = objects.find(item => item.matching)!;
  target = { x: matching.x, y: matching.y, radius: matching.radius };
  referenceValue = scenario.reference;
  for (const item of objects) {
    const x = item.x - rect.left;
    const y = item.y - rect.top;
    context.beginPath();
    context.arc(x, y, item.radius, 0, Math.PI * 2);
    context.fillStyle = phase === 'complete' ? '#f0f2f5' : '#ffffff';
    context.fill();
    context.strokeStyle = phase === 'complete' ? '#aeb6c0' : '#aeb6c0';
    context.lineWidth = 1.5;
    context.stroke();
    drawSymbol(context, item.symbol, x, y + 0.5, scenario.objectSizePx * 0.62);
  }
}

function record(type: BrowserEvent['type'], atMs: number, extra: Partial<BrowserEvent> = {}): void {
  events.push({ trialId: scenario.id, type, atMs, clock: 'browser-performance', phase, ...extra });
}
function finish(message: string): void {
  phase = 'complete';
  cancelAnimationFrame(animation);
  status.textContent = 'Complete';
  instruction.textContent = message;
  draw();
  document.querySelector<HTMLButtonElement>('#start')!.disabled = false;
}
function frame(): void {
  const now = performance.now();
  if (phase === 'waiting' && now >= plannedActivation) {
    phase = 'active';
    deadline = now + scenario.responseWindowMs;
    draw();
    record('activated', now, { plannedActivationAtMs: plannedActivation, deadlineAtMs: deadline });
    if (scenario.category === 'target-acquisition') {
      status.textContent = 'Find the match';
      instruction.textContent = 'Click the object that matches the reference symbol.';
    } else {
      status.textContent = 'Green';
      instruction.textContent = 'Click the target now.';
    }
  }
  if (phase === 'active' && now >= deadline) {
    record('expired', now, { deadlineAtMs: deadline });
    result.textContent = 'No response';
    finish('Response window expired.');
  }
  if (phase !== 'complete') animation = requestAnimationFrame(frame);
}

const environment: BrowserEnvironment = {
  prepare(next, index, total) {
    cancelAnimationFrame(animation);
    scenario = next;
    phase = 'prepared';
    events = [];
    status.textContent = 'Ready';
    instruction.textContent = taskRegistry[scenario.category].instructions;
    document.querySelector<HTMLElement>('#rules')!.textContent = taskRegistry[scenario.category].instructions;
    progress.textContent = `Trial ${index} of ${total}`;
    levelLabel.textContent = `Level ${scenario.level}`;
    responseWindowLabel.textContent = scenario.category === 'target-acquisition' ? 'Time limit' : 'Response window';
    document.querySelector<HTMLElement>('#window')!.textContent = `${scenario.responseWindowMs / 1000} s`;
    result.textContent = '—';
    const task = taskRegistry[scenario.category];
    categoryTitle.textContent = task.title;
    categorySubtitle.textContent = scenario.category === 'target-acquisition'
      ? 'Match the reference symbol. Choose once.' : 'Wait for green. Make one precise click.';
    document.title = `${task.title} · ReactBench`;
    canvas.classList.toggle('acquisition', scenario.category === 'target-acquisition');
    canvas.setAttribute('aria-label', scenario.category === 'target-acquisition'
      ? 'Choose the symbol that matches the reference.' : 'Click the circular target only after it turns green.');
    reference.hidden = scenario.category !== 'target-acquisition';
    if (scenario.category === 'target-acquisition') paintReference(scenario.reference.symbol);
    draw();
    record('prepared', performance.now());
    return this.snapshot();
  },
  start() {
    if (phase !== 'prepared') throw new Error('Prepare a trial before starting it.');
    const now = performance.now();
    if (scenario.category === 'visual-reaction') {
      phase = 'waiting';
      plannedActivation = now + scenario.initialDelayMs;
      record('started', now, { plannedActivationAtMs: plannedActivation });
      status.textContent = 'Red';
      instruction.textContent = 'Wait. The target will turn green.';
    } else {
      phase = 'waiting';
      plannedActivation = now + targetAcquisitionReadyMs;
      record('started', now, { plannedActivationAtMs: plannedActivation });
      status.textContent = 'Get ready';
      instruction.textContent = 'The ten-second response window begins shortly.';
    }
    document.querySelector<HTMLButtonElement>('#start')!.disabled = true;
    draw();
    animation = requestAnimationFrame(frame);
  },
  snapshot() {
    return structuredClone({ trialId: scenario.id, phase, nowMs: performance.now(), target, objects, reference: referenceValue, events });
  },
};
window.reactBenchEnvironment = environment;
document.addEventListener('click', event => {
  if ((event.target as Element).closest('[data-control]') || (phase !== 'waiting' && phase !== 'active')) return;
  const now = performance.now();
  if (phase === 'active' && now >= deadline) {
    record('expired', now, { deadlineAtMs: deadline });
    result.textContent = 'No response';
    finish('Response window expired.');
    return;
  }
  const objectIndex = scenario.category === 'target-acquisition'
    ? objects.findIndex(item => Math.hypot(event.clientX - item.x, event.clientY - item.y) <= item.radius)
    : -1;
  const hit = scenario.category === 'target-acquisition'
    ? objectIndex >= 0 && objects[objectIndex]!.matching
    : Math.hypot(event.clientX - target.x, event.clientY - target.y) <= target.radius;
  record('action-registered', now, { x: event.clientX, y: event.clientY, hit,
    ...(objectIndex >= 0 ? { objectIndex } : {}), inputTrusted: event.isTrusted });
  const { outcome, reactionLatencyMs } = grade(events);
  result.textContent = reactionLatencyMs === null ? outcome : `${Math.round(reactionLatencyMs)} ms`;
  finish({ success: scenario.category === 'target-acquisition' ? 'Correct match. Trial complete.' : 'Target hit. Trial complete.',
    premature: scenario.category === 'target-acquisition' ? 'Too soon. Wait for “Find the match.”' : 'Too soon. Wait for green.',
    wrong: 'Incorrect choice. Trial complete.', expired: 'Response window expired.' }[outcome]);
});
let practiceIndex = 0;
const practiceCategory = document.querySelector<HTMLSelectElement>('#practice-category')!;
const practiceLevel = document.querySelector<HTMLSelectElement>('#practice-level')!;
function updatePracticeLevels(): void {
  const acquisition = practiceCategory.value === 'target-acquisition';
  for (const [index, option] of Array.from(practiceLevel.options).entries()) {
    const level = index + 1;
    const seconds = defaultConfig.responseWindowsMs[index]! / 1000;
    option.textContent = acquisition
      ? `Level ${level} · ${targetAcquisitionObjectsByLevel[index]} objects`
      : `Level ${level} · ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
}
practiceCategory.addEventListener('change', updatePracticeLevels);
updatePracticeLevels();
document.querySelector<HTMLFormElement>('#practice-controls')!.addEventListener('submit', event => event.preventDefault());
document.querySelector<HTMLButtonElement>('#start')!.addEventListener('click', () => {
  const level = Number(practiceLevel.value) as 1 | 2 | 3 | 4 | 5;
  const category = practiceCategory.value as Category;
  const plan = createPlan({ ...defaultConfigFor(category), levels: [level], trialsPerLevel: 1, seed: `practice-${practiceIndex++}` });
  environment.prepare(plan[0]!, 1, 1);
  environment.start();
});
document.querySelector<HTMLElement>('#rules')!.textContent = taskRegistry['visual-reaction'].instructions;
environment.prepare(createPlan({ ...defaultConfigFor('visual-reaction'), levels: [1], trialsPerLevel: 1 })[0]!, 1, 1);
window.addEventListener('resize', () => draw());
