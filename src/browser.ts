import { createPlan, defaultConfig, defaultDynamicTrackingConfig, dynamicTracking, dynamicTrackingReferenceBandPx, visualReaction } from './registry.js';
import { grade } from './grader.js';
import type { BrowserEnvironment, BrowserEvent, MovingTargetState, Scenario, SceneSnapshot } from './types.js';

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const context = canvas.getContext('2d')!;
const status = document.querySelector<HTMLElement>('#status')!;
const instruction = document.querySelector<HTMLElement>('#instruction')!;
const progress = document.querySelector<HTMLElement>('#progress')!;
const levelLabel = document.querySelector<HTMLElement>('#level-label')!;
const result = document.querySelector<HTMLElement>('#result')!;
const controlled = new URLSearchParams(location.search).has('controlled');
document.querySelector<HTMLElement>('#practice-controls')!.hidden = controlled;
const access = new URLSearchParams(location.search).get('access');
document.querySelector<HTMLElement>('#mode')!.textContent = !controlled ? 'Local practice'
  : access === 'privileged-oracle' ? 'Oracle control baseline' : 'Visual agent evaluation';
let scenario: Scenario;
let phase: SceneSnapshot['phase'] = 'prepared';
let events: BrowserEvent[] = [];
let target = { x: 0, y: 0, radius: 42 };
let startedAtMs: number | null = null;
let deadline = 0;
let animation = 0;
let lastCountdownSecond: number | null = null;

function reflectedPosition(value: number, minimum: number, maximum: number): number {
  const span = maximum - minimum;
  if (span <= 0) return minimum;
  const cycle = ((value - minimum) % (span * 2) + span * 2) % (span * 2);
  return cycle <= span ? minimum + cycle : maximum - (cycle - span);
}

function movingTargetsAt(nowMs: number): MovingTargetState[] {
  if (scenario.category !== 'dynamic-tracking') return [];
  const rect = canvas.getBoundingClientRect();
  const elapsedSeconds = Math.max(0, nowMs - (startedAtMs ?? nowMs)) / 1000;
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

function draw(nowMs = performance.now()): void {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * pixelRatio);
  const height = Math.round(rect.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  if (scenario.category === 'visual-reaction') {
    target = { x: rect.left + rect.width * scenario.target.u,
      y: rect.top + rect.height * scenario.target.v, radius: scenario.target.radius };
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
  if (scenario.category === 'dynamic-tracking' && phase === 'active' && now >= deadline) {
    record('expired', now, { deadlineAtMs: deadline });
    result.textContent = 'No response';
    finish('Click window expired.');
  } else if (scenario.category === 'visual-reaction' && phase === 'waiting' && now >= scenarioStartAtMs()) {
    phase = 'active';
    deadline = now + scenario.responseWindowMs;
    record('activated', now, { plannedActivationAtMs: scenarioStartAtMs(), deadlineAtMs: deadline });
    status.textContent = 'Green';
    instruction.textContent = 'Click the target now.';
  } else if (scenario.category === 'visual-reaction' && phase === 'active' && now >= deadline) {
    record('expired', now, { deadlineAtMs: deadline });
    result.textContent = 'No response';
    finish('Response window expired.');
  }
  if (phase !== 'complete') {
    draw(now);
    if (scenario.category === 'dynamic-tracking' && phase === 'active') {
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      if (remaining !== lastCountdownSecond) {
        status.textContent = `Moving · ${remaining} s`;
        lastCountdownSecond = remaining;
      }
    }
    animation = requestAnimationFrame(frame);
  }
}

let plannedActivation = 0;
function scenarioStartAtMs(): number { return plannedActivation; }

const environment: BrowserEnvironment = {
  prepare(next, index, total) {
    cancelAnimationFrame(animation);
    scenario = next;
    phase = 'prepared';
    events = [];
    startedAtMs = null;
    lastCountdownSecond = null;
    status.textContent = 'Ready';
    progress.textContent = `Trial ${index} of ${total}`;
    levelLabel.textContent = `Level ${scenario.level}`;
    result.textContent = '—';
    const dynamic = scenario.category === 'dynamic-tracking';
    const title = dynamic ? dynamicTracking.title : visualReaction.title;
    const taskInstructions = dynamic ? dynamicTracking.instructions : visualReaction.instructions;
    document.querySelector<HTMLElement>('#game-title')!.textContent = title;
    document.querySelector<HTMLElement>('#game-tagline')!.textContent = dynamic
      ? 'Track the star as it moves among distractors.' : 'Wait for green. Make one precise click.';
    document.querySelector<HTMLElement>('.experiment')!.setAttribute('aria-label', `${title} game`);
    canvas.setAttribute('aria-label', dynamic ? 'Click the moving star shown in the reference.' : 'Click the circular target only after it turns green.');
    document.querySelector<HTMLElement>('#window-label')!.textContent = dynamic ? 'Click window' : 'Response window';
    const windowMs = scenario.category === 'dynamic-tracking' ? scenario.clickWindowMs : scenario.responseWindowMs;
    document.querySelector<HTMLElement>('#window')!.textContent = `${windowMs / 1000} s`;
    document.querySelector<HTMLElement>('#rules')!.textContent = taskInstructions;
    document.querySelector<HTMLElement>('#attempt-label')!.textContent = 'One attempt';
    instruction.textContent = dynamic ? 'Watch the field, then click the star once the trial begins.' : 'Wait for green. Then click once.';
    draw();
    record('prepared', performance.now());
    return this.snapshot();
  },
  start() {
    if (phase !== 'prepared') throw new Error('Prepare a trial before starting it.');
    const now = performance.now();
    phase = scenario.category === 'dynamic-tracking' ? 'active' : 'waiting';
    startedAtMs = now;
    plannedActivation = now + (scenario.category === 'visual-reaction' ? scenario.initialDelayMs : 0);
    deadline = scenario.category === 'dynamic-tracking' ? now + scenario.clickWindowMs : 0;
    record('started', now, { plannedActivationAtMs: plannedActivation,
      ...(scenario.category === 'dynamic-tracking' ? { deadlineAtMs: deadline } : {}) });
    status.textContent = scenario.category === 'dynamic-tracking' ? 'Moving' : 'Red';
    instruction.textContent = scenario.category === 'dynamic-tracking'
      ? 'Click the star now. The objects keep moving.' : 'Wait. The target will turn green.';
    document.querySelector<HTMLButtonElement>('#start')!.disabled = true;
    animation = requestAnimationFrame(frame);
  },
  snapshot() {
    const nowMs = performance.now();
    if (scenario.category === 'dynamic-tracking') {
      const objects = movingTargetsAt(nowMs);
      const requiredTargetId = scenario.requiredTargetId;
      const required = objects.find(object => object.id === requiredTargetId)!;
      return structuredClone({ trialId: scenario.id, phase, nowMs,
        target: { x: required.x, y: required.y, radius: required.radius },
        objects, requiredTargetId, events });
    }
    return structuredClone({ trialId: scenario.id, phase, nowMs, target, events });
  },
};
window.reactBenchEnvironment = environment;

document.addEventListener('click', event => {
  if ((event.target as Element).closest('[data-control]') || (phase !== 'waiting' && phase !== 'active')) return;
  const now = performance.now();
  if (scenario.category === 'dynamic-tracking' && now >= deadline) {
    record('expired', now, { deadlineAtMs: deadline });
    result.textContent = 'No response';
    finish('Click window expired.');
    return;
  }

  if (scenario.category === 'dynamic-tracking') {
    const objects = movingTargetsAt(now);
    const clicked = objects.find(object => Math.hypot(event.clientX - object.x, event.clientY - object.y) <= object.radius);
    const hit = clicked?.id === scenario.requiredTargetId;
    record('action-registered', now, { x: event.clientX, y: event.clientY, hit, inputTrusted: event.isTrusted,
      objects, requiredTargetId: scenario.requiredTargetId, clickedObjectId: clicked?.id ?? null });
    const { outcome, reactionLatencyMs } = grade(events, scenario.category);
    result.textContent = reactionLatencyMs === null ? outcome : `${Math.round(reactionLatencyMs)} ms`;
    finish(outcome === 'success' ? 'Required target hit.' : 'Incorrect click. This trial is complete.');
    return;
  }

  const hit = Math.hypot(event.clientX - target.x, event.clientY - target.y) <= target.radius;
  record('action-registered', now, { x: event.clientX, y: event.clientY, hit, inputTrusted: event.isTrusted });
  const { outcome, reactionLatencyMs } = grade(events, scenario.category);
  result.textContent = reactionLatencyMs === null ? outcome : `${Math.round(reactionLatencyMs)} ms`;
  finish({ success: 'Target hit. Trial complete.', premature: 'Too soon. Wait for green.',
    wrong: 'Incorrect click. Aim for the target.', expired: 'Response window expired.' }[outcome]);
});

const practiceCategory = document.querySelector<HTMLSelectElement>('#practice-category')!;
const practiceLevel = document.querySelector<HTMLSelectElement>('#practice-level')!;
function updatePracticeLevels(): void {
  const dynamic = practiceCategory.value === 'dynamic-tracking';
  practiceLevel.innerHTML = dynamic
    ? '<option value="1">Level 1 · 1 moving object</option><option value="2">Level 2 · 5 moving objects</option><option value="3">Level 3 · 15 moving objects</option>'
    : '<option value="1">Level 1 · 5 seconds</option><option value="2">Level 2 · 4 seconds</option><option value="3">Level 3 · 3 seconds</option><option value="4">Level 4 · 2 seconds</option><option value="5">Level 5 · 1 second</option>';
}
practiceCategory.addEventListener('change', updatePracticeLevels);
document.querySelector<HTMLFormElement>('#practice-controls')!.addEventListener('submit', event => event.preventDefault());
let practiceIndex = 0;
document.querySelector<HTMLButtonElement>('#start')!.addEventListener('click', () => {
  const level = Number(practiceLevel.value) as 1 | 2 | 3 | 4 | 5;
  const seed = `practice-${practiceIndex++}`;
  const config = practiceCategory.value === 'dynamic-tracking'
    ? { ...defaultDynamicTrackingConfig, levels: [level as 1 | 2 | 3], trialsPerLevel: 1, seed }
    : { ...defaultConfig, levels: [level], trialsPerLevel: 1, seed };
  const plan = createPlan(config);
  environment.prepare(plan[0]!, 1, 1);
  environment.start();
});

document.querySelector<HTMLElement>('#rules')!.textContent = visualReaction.instructions;
environment.prepare(createPlan({ ...defaultConfig, levels: [1], trialsPerLevel: 1 })[0]!, 1, 1);
window.addEventListener('resize', () => draw());
