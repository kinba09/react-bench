import { createPlan, defaultConfig, defaultConfigFor, dynamicTrackingObjectCounts, dynamicTrackingReferenceBandPx, targetAcquisitionObjectsByLevel, taskRegistry, validateConfig } from './registry.js';
import { grade } from './grader.js';
import type { AcquisitionObjectState, BrowserEnvironment, BrowserEvent, Category, MovingTargetState, Scenario, SceneSnapshot, TargetSymbol } from './types.js';

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
const phaseCountdown = document.querySelector<HTMLElement>('#phase-countdown')!;
const categoryTitle = document.querySelector<HTMLElement>('#category-title')!;
const categorySubtitle = document.querySelector<HTMLElement>('#category-subtitle')!;
const controlled = new URLSearchParams(location.search).has('controlled');
document.querySelector<HTMLElement>('#practice-controls')!.hidden = controlled;
const access = new URLSearchParams(location.search).get('access');
document.querySelector<HTMLElement>('#mode')!.textContent = !controlled ? 'Local practice'
  : access === 'privileged-oracle' ? 'Oracle control baseline' : 'Visual agent evaluation';
let scenario: Scenario;
let phase: SceneSnapshot['phase'] = 'prepared';
let events: BrowserEvent[] = [];
let target = { x: 0, y: 0, radius: 42 };
let objects: AcquisitionObjectState[] = [];
let motionStartedAtMs: number | null = null;
let lastCountdownSecond: number | null = null;
let referenceValue: SceneSnapshot['reference'] = null;
let plannedActivation = 0;
let watchDeadline = 0;
let hiddenDeadline = 0;
let deadline = 0;
let animation = 0;
let keepTargetsHiddenAfterFinish = false;

function reflectedPosition(value: number, minimum: number, maximum: number): number {
  const span = maximum - minimum;
  if (span <= 0) return minimum;
  const cycle = ((value - minimum) % (span * 2) + span * 2) % (span * 2);
  return cycle <= span ? minimum + cycle : maximum - (cycle - span);
}

function movingTargetsAt(nowMs: number): MovingTargetState[] {
  if (scenario.category !== 'dynamic-tracking') return [];
  const rect = canvas.getBoundingClientRect();
  const elapsedSeconds = Math.max(0, nowMs - (motionStartedAtMs ?? nowMs)) / 1000;
  return scenario.objects.map(object => {
    const localX = reflectedPosition(object.u * rect.width + object.velocityX * elapsedSeconds, object.radius, rect.width - object.radius);
    const playableHeight = Math.max(0, rect.height - dynamicTrackingReferenceBandPx);
    const localY = reflectedPosition(dynamicTrackingReferenceBandPx + object.v * playableHeight + object.velocityY * elapsedSeconds,
      dynamicTrackingReferenceBandPx + object.radius, rect.height - object.radius);
    return { id: object.id, role: object.role, x: rect.left + localX, y: rect.top + localY, radius: object.radius };
  });
}

function drawStar(x: number, y: number, outerRadius: number, innerRadius: number): void {
  context.beginPath();
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(px, py); else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
}

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

function draw(nowMs = performance.now()): void {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * pixelRatio);
  const height = Math.round(rect.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  if (scenario.category === 'visual-reaction' || scenario.category === 'inhibitory-control') {
    target = { x: rect.left + rect.width * scenario.target.u,
      y: rect.top + rect.height * scenario.target.v, radius: scenario.target.radius };
    objects = [];
    referenceValue = null;
    context.beginPath();
    context.arc(target.x - rect.left, target.y - rect.top, target.radius, 0, Math.PI * 2);
    context.fillStyle = phase === 'complete' ? '#7c8591'
      : scenario.category === 'visual-reaction' ? phase === 'active' ? '#15804c' : '#cc423a'
        : phase === 'active' ? scenario.condition === 'go' ? '#15804c' : '#cc423a' : '#aeb6c0';
    context.fill();
    context.beginPath();
    context.arc(target.x - rect.left, target.y - rect.top, 4, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    return;
  }

  if (scenario.category === 'dynamic-tracking') {
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#dce4ec';
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(14, 11, 188, 46, 9);
    context.fill();
    context.stroke();
    context.fillStyle = '#687483';
    context.font = '600 10px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText('REFERENCE', 25, 28);
    context.fillStyle = '#293746';
    context.font = '600 13px system-ui, sans-serif';
    context.fillText('Find the star', 25, 47);
    context.fillStyle = '#f2b544';
  drawStar(177, 34, 14, 6.5);

  if (phase === 'prepared' || phase === 'waiting' || phase === 'hidden' || (phase === 'complete' && keepTargetsHiddenAfterFinish)) return;

  const targets = movingTargetsAt(nowMs).sort((a, b) => Number(a.role === 'required') - Number(b.role === 'required'));
  for (const object of targets) {
    const x = object.x - rect.left;
    const y = object.y - rect.top;
    context.beginPath();
    context.arc(x, y, object.radius, 0, Math.PI * 2);
    context.fillStyle = '#e5edf5';
    context.fill();
    context.strokeStyle = '#55718c';
    context.lineWidth = 2;
    context.stroke();
    if (object.id === scenario.requiredTargetId) {
      context.fillStyle = '#e5a82e';
      drawStar(x, y, 13, 6);
    } else {
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fillStyle = '#647f98';
      context.fill();
    }
  }
    return;
  }

  const radius = scenario.objectSizePx / 2;
  objects = scenario.objects.map(item => ({ id: item.id, x: rect.left + rect.width * item.u,
    y: rect.top + rect.height * item.v, radius, symbol: item.symbol, matching: item.matching }));
  const matching = objects.find(item => item.matching)!;
  target = { x: matching.x, y: matching.y, radius: matching.radius };
  referenceValue = scenario.reference;
  if (phase === 'prepared' || phase === 'waiting') return;
  for (const item of objects) {
    const x = item.x - rect.left;
    const y = item.y - rect.top;
    context.beginPath();
    context.arc(x, y, item.radius, 0, Math.PI * 2);
    context.fillStyle = phase === 'complete' ? '#f0f2f5' : '#ffffff';
    context.fill();
    context.strokeStyle = '#aeb6c0';
    context.lineWidth = 1.5;
    context.stroke();
    drawSymbol(context, item.symbol, x, y + 0.5, scenario.objectSizePx * 0.62);
  }
}

function record(type: BrowserEvent['type'], atMs: number, extra: Partial<BrowserEvent> = {}): void {
  events.push({ trialId: scenario.id, type, atMs, clock: 'browser-performance', phase, ...extra });
}
function finish(message: string): void {
  keepTargetsHiddenAfterFinish = phase === 'hidden';
  phase = 'complete';
  cancelAnimationFrame(animation);
  status.textContent = 'Complete';
  phaseCountdown.hidden = true;
  instruction.textContent = message;
  draw();
  document.querySelector<HTMLButtonElement>('#start')!.disabled = false;
}
function finishExpiredWindow(now: number): void {
  record('expired', now, { deadlineAtMs: deadline });
  const graded = grade(events, scenario);
  result.textContent = graded.conditionOutcome === 'withheld' ? 'Withheld'
    : graded.conditionOutcome === 'go-omission' ? 'Go omission' : 'No response';
  finish(graded.conditionOutcome === 'withheld' ? 'Correctly withheld.' : 'Response window expired.');
}
function frame(): void {
  const now = performance.now();
  if (scenario.category === 'dynamic-tracking' && phase === 'watching' && now >= watchDeadline) {
    phase = 'hidden';
    hiddenDeadline = now + scenario.hiddenDurationMs;
    lastCountdownSecond = null;
    record('phase-transition', now, { phaseDeadlineAtMs: hiddenDeadline });
    status.textContent = 'Hidden';
    instruction.textContent = 'The moving field is hidden. Hold the star’s last position in mind.';
  }
  if (scenario.category === 'dynamic-tracking' && phase === 'hidden' && now >= hiddenDeadline) {
    phase = 'active';
    deadline = now + scenario.clickWindowMs;
    lastCountdownSecond = null;
    phaseCountdown.hidden = true;
    record('phase-transition', now, { phaseDeadlineAtMs: deadline });
    record('activated', now, { plannedActivationAtMs: plannedActivation, deadlineAtMs: deadline });
    status.textContent = 'Click';
    instruction.textContent = 'Click the star now. The objects keep moving.';
  } else if (phase === 'waiting' && now >= plannedActivation) {
    phase = 'active';
    if (scenario.category === 'dynamic-tracking') motionStartedAtMs = now;
    deadline = now + (scenario.category === 'dynamic-tracking' ? scenario.clickWindowMs : scenario.responseWindowMs);
    draw(now);
    record('activated', now, { plannedActivationAtMs: plannedActivation, deadlineAtMs: deadline });
    if (scenario.category === 'dynamic-tracking') {
      status.textContent = 'Moving';
      instruction.textContent = 'Click the star now. The objects keep moving.';
    } else if (scenario.category === 'target-acquisition') {
      status.textContent = 'Find the match';
      instruction.textContent = 'Click the object that matches the reference symbol.';
    } else if (scenario.category === 'inhibitory-control') {
      const remaining = Math.max(1, Math.ceil((deadline - now) / 1000));
      status.textContent = `${scenario.condition === 'go' ? 'Go' : 'No-go'} · ${remaining} s`;
      lastCountdownSecond = remaining;
      instruction.textContent = scenario.condition === 'go' ? 'Green cue: click the target once.' : 'Red cue: do not click until the response window ends.';
    } else {
      status.textContent = 'Green';
      instruction.textContent = 'Click the target now.';
    }
  }
  if (phase === 'active' && now >= deadline) {
    finishExpiredWindow(now);
  }
  if (phase !== 'complete') {
    if (scenario.category === 'dynamic-tracking') {
      draw(now);
      if (phase === 'hidden') {
        const remaining = Math.max(0, Math.ceil((hiddenDeadline - now) / 1000));
        if (remaining !== lastCountdownSecond) {
          status.textContent = `Hidden · ${remaining} s`;
          phaseCountdown.textContent = `Reappears in ${remaining} s`;
          phaseCountdown.hidden = false;
          lastCountdownSecond = remaining;
        }
      } else if (phase === 'active') {
        phaseCountdown.hidden = true;
        const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
        if (remaining !== lastCountdownSecond) {
          status.textContent = `${scenario.level >= 4 ? 'Click' : 'Moving'} · ${remaining} s`;
          lastCountdownSecond = remaining;
        }
      }
    } else if (scenario.category === 'inhibitory-control' && phase === 'active') {
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      if (remaining !== lastCountdownSecond) {
        status.textContent = `${scenario.condition === 'go' ? 'Go' : 'No-go'} · ${remaining} s`;
        lastCountdownSecond = remaining;
      }
    }
    animation = requestAnimationFrame(frame);
  }
}

const environment: BrowserEnvironment = {
  prepare(next, index, total) {
    cancelAnimationFrame(animation);
    scenario = next;
    phase = 'prepared';
    events = [];
    motionStartedAtMs = null;
    lastCountdownSecond = null;
    watchDeadline = 0;
    hiddenDeadline = 0;
    keepTargetsHiddenAfterFinish = false;
    phaseCountdown.hidden = true;
    status.textContent = 'Ready';
    instruction.textContent = taskRegistry[scenario.category].instructions;
    document.querySelector<HTMLElement>('#rules')!.textContent = taskRegistry[scenario.category].instructions;
    progress.textContent = `Trial ${index} of ${total}`;
    levelLabel.textContent = `Level ${scenario.level}`;
    responseWindowLabel.textContent = scenario.category === 'target-acquisition' ? 'Time limit' : scenario.category === 'dynamic-tracking' ? 'Click window' : 'Response window';
    document.querySelector<HTMLElement>('#window')!.textContent = `${(scenario.category === 'dynamic-tracking' ? scenario.clickWindowMs : scenario.responseWindowMs) / 1000} s`;
    result.textContent = '—';
    const task = taskRegistry[scenario.category];
    categoryTitle.textContent = task.title;
    categorySubtitle.textContent = scenario.category === 'target-acquisition'
      ? 'Match the reference symbol. Choose once.' : scenario.category === 'dynamic-tracking' ? 'Track the star as it moves among distractors.'
        : scenario.category === 'inhibitory-control' ? 'Click on green. Withhold on red.' : 'Wait for green. Make one precise click.';
    document.title = `${task.title} · ReactBench`;
    canvas.classList.toggle('acquisition', scenario.category === 'target-acquisition');
    canvas.setAttribute('aria-label', scenario.category === 'target-acquisition'
      ? 'Choose the symbol that matches the reference.' : scenario.category === 'dynamic-tracking' ? 'Click the moving star shown in the reference.'
        : scenario.category === 'inhibitory-control' ? 'Respond to green cues and withhold from red cues.' : 'Click the circular target only after it turns green.');
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
    } else if (scenario.category === 'dynamic-tracking' && scenario.level >= 4) {
      phase = 'watching';
      motionStartedAtMs = now;
      watchDeadline = now + scenario.watchDurationMs;
      hiddenDeadline = watchDeadline + scenario.hiddenDurationMs;
      plannedActivation = hiddenDeadline;
      record('started', now, { plannedActivationAtMs: plannedActivation, phaseDeadlineAtMs: watchDeadline });
      status.textContent = 'Watch';
      instruction.textContent = 'Watch the star as it moves. The field will disappear briefly.';
    } else if (scenario.category === 'inhibitory-control') {
      phase = 'waiting';
      plannedActivation = now + scenario.initialDelayMs;
      record('started', now, { plannedActivationAtMs: plannedActivation });
      status.textContent = 'Ready';
      instruction.textContent = 'Wait for the cue. Green means click; red means withhold.';
    } else {
      phase = 'waiting';
      plannedActivation = now + scenario.initialDelayMs;
      record('started', now, { plannedActivationAtMs: plannedActivation });
      status.textContent = 'Get ready';
      instruction.textContent = 'The ten-second response window begins shortly.';
    }
    document.querySelector<HTMLButtonElement>('#start')!.disabled = true;
    draw();
    animation = requestAnimationFrame(frame);
  },
  snapshot() {
    const nowMs = performance.now();
    if (scenario.category === 'dynamic-tracking') {
      const moving = movingTargetsAt(nowMs);
      const requiredTargetId = scenario.requiredTargetId;
      const required = moving.find(object => object.id === requiredTargetId)!;
      return structuredClone({ trialId: scenario.id, phase, nowMs, target: { x: required.x, y: required.y, radius: required.radius },
        objects: moving, requiredTargetId: scenario.requiredTargetId, reference: null, events });
    }
    return structuredClone({ trialId: scenario.id, phase, nowMs, target, objects, reference: referenceValue,
      ...(scenario.category === 'inhibitory-control' ? { condition: scenario.condition } : {}), events });
  },
};
window.reactBenchEnvironment = environment;
document.addEventListener('click', event => {
  const prematureDynamicPhase = scenario.category === 'dynamic-tracking'
    && (phase === 'waiting' || phase === 'watching' || phase === 'hidden');
  if ((event.target as Element).closest('[data-control]') || (phase !== 'waiting' && phase !== 'watching' && phase !== 'hidden' && phase !== 'active')) return;
  const now = performance.now();
  if (phase === 'active' && now >= deadline) {
    finishExpiredWindow(now);
    return;
  }
  if (scenario.category === 'dynamic-tracking') {
    const objects = prematureDynamicPhase ? [] : movingTargetsAt(now);
    const clicked = prematureDynamicPhase ? undefined
      : objects.find(object => Math.hypot(event.clientX - object.x, event.clientY - object.y) <= object.radius);
    const hit = clicked?.id === scenario.requiredTargetId;
    record('action-registered', now, { x: event.clientX, y: event.clientY, hit, inputTrusted: event.isTrusted,
      objects, requiredTargetId: scenario.requiredTargetId, clickedObjectId: clicked?.id ?? null });
    const { outcome, reactionLatencyMs } = grade(events, scenario);
    result.textContent = reactionLatencyMs === null ? outcome : `${Math.round(reactionLatencyMs)} ms`;
    finish(outcome === 'success' ? 'Required target hit.' : outcome === 'premature' ? 'Too soon. Wait for the moving field.' : 'Incorrect click. This trial is complete.');
    return;
  }

  if (scenario.category === 'inhibitory-control') {
    const hit = scenario.condition === 'go' && Math.hypot(event.clientX - target.x, event.clientY - target.y) <= target.radius;
    record('action-registered', now, { x: event.clientX, y: event.clientY, hit, inputTrusted: event.isTrusted });
    const graded = grade(events, scenario);
    result.textContent = graded.reactionLatencyMs === null ? graded.conditionOutcome ?? graded.outcome : `${Math.round(graded.reactionLatencyMs)} ms`;
    finish(graded.conditionOutcome === 'forbidden-click' ? 'A red cue forbids clicking. Trial complete.'
      : graded.conditionOutcome === 'go-premature-click' ? 'Too soon. Wait for the cue.'
        : graded.conditionOutcome === 'go-wrong-click' ? 'Incorrect target. Trial complete.' : 'Green cue answered. Trial complete.');
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
  const { outcome, reactionLatencyMs } = grade(events, scenario);
  result.textContent = reactionLatencyMs === null ? outcome : `${Math.round(reactionLatencyMs)} ms`;
  finish({ success: scenario.category === 'target-acquisition' ? 'Correct match. Trial complete.' : 'Target hit. Trial complete.',
    premature: scenario.category === 'target-acquisition' ? 'Too soon. Wait for “Find the match.”' : 'Too soon. Wait for green.',
    wrong: 'Incorrect choice. Trial complete.', expired: 'Response window expired.' }[outcome]);
});
let practiceIndex = 0;
const practiceCategory = document.querySelector<HTMLSelectElement>('#practice-category')!;
const practiceLevel = document.querySelector<HTMLSelectElement>('#practice-level')!;
function updatePracticeLevels(): void {
  const category = practiceCategory.value as Category;
  const levels = defaultConfigFor(category).levels;
  practiceLevel.replaceChildren(...levels.map(level => {
    const option = document.createElement('option');
    option.value = String(level);
    const seconds = defaultConfig.responseWindowsMs[level - 1]! / 1000;
    option.textContent = category === 'target-acquisition' ? `Level ${level} · ${targetAcquisitionObjectsByLevel[level - 1]} objects`
      : category === 'dynamic-tracking' ? `Level ${level} · ${dynamicTrackingObjectCounts[level as keyof typeof dynamicTrackingObjectCounts]} moving ${level === 1 ? 'object' : 'objects'}`
      : `Level ${level} · ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
    return option;
  }));
}
practiceCategory.addEventListener('change', updatePracticeLevels);
updatePracticeLevels();
document.querySelector<HTMLFormElement>('#practice-controls')!.addEventListener('submit', event => event.preventDefault());
document.querySelector<HTMLButtonElement>('#start')!.addEventListener('click', () => {
  const level = Number(practiceLevel.value) as 1 | 2 | 3 | 4 | 5;
  const category = practiceCategory.value as Category;
  const plan = createPlan(validateConfig({ ...defaultConfigFor(category), levels: [level], trialsPerLevel: 1, seed: `practice-${practiceIndex++}` }));
  environment.prepare(plan[0]!, 1, 1);
  environment.start();
});
document.querySelector<HTMLElement>('#rules')!.textContent = taskRegistry['visual-reaction'].instructions;
environment.prepare(createPlan({ ...defaultConfigFor('visual-reaction'), levels: [1], trialsPerLevel: 1 })[0]!, 1, 1);
window.addEventListener('resize', () => draw());
