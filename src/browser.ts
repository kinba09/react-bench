import { createPlan, defaultConfig, visualReaction } from './registry.js';
import { grade } from './grader.js';
import type { BrowserEnvironment, BrowserEvent, Scenario, SceneSnapshot } from './types.js';

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
let plannedActivation = 0;
let deadline = 0;
let animation = 0;

function draw(): void {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  target = { x: rect.left + rect.width * scenario.target.u,
    y: rect.top + rect.height * scenario.target.v, radius: scenario.target.radius };
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  context.arc(target.x - rect.left, target.y - rect.top, target.radius, 0, Math.PI * 2);
  context.fillStyle = phase === 'active' ? '#15804c' : phase === 'complete' ? '#7c8591' : '#cc423a';
  context.fill();
  context.beginPath();
  context.arc(target.x - rect.left, target.y - rect.top, 4, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.fill();
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
    status.textContent = 'Green';
    instruction.textContent = 'Click the target now.';
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
    instruction.textContent = 'Wait for green. Then click once.';
    progress.textContent = `Trial ${index} of ${total}`;
    levelLabel.textContent = `Level ${scenario.level}`;
    document.querySelector<HTMLElement>('#window')!.textContent = `${scenario.responseWindowMs / 1000} s`;
    result.textContent = '—';
    draw();
    record('prepared', performance.now());
    return this.snapshot();
  },
  start() {
    if (phase !== 'prepared') throw new Error('Prepare a trial before starting it.');
    phase = 'waiting';
    const now = performance.now();
    plannedActivation = now + scenario.initialDelayMs;
    record('started', now, { plannedActivationAtMs: plannedActivation });
    status.textContent = 'Red';
    instruction.textContent = 'Wait. The target will turn green.';
    document.querySelector<HTMLButtonElement>('#start')!.disabled = true;
    animation = requestAnimationFrame(frame);
  },
  snapshot() {
    return structuredClone({ trialId: scenario.id, phase, nowMs: performance.now(), target, events });
  },
};
window.reactBenchEnvironment = environment;
document.addEventListener('click', event => {
  if ((event.target as Element).closest('[data-control]') || (phase !== 'waiting' && phase !== 'active')) return;
  const now = performance.now();
  const hit = Math.hypot(event.clientX - target.x, event.clientY - target.y) <= target.radius;
  record('action-registered', now, { x: event.clientX, y: event.clientY, hit, inputTrusted: event.isTrusted });
  const { outcome, reactionLatencyMs } = grade(events);
  result.textContent = reactionLatencyMs === null ? outcome : `${Math.round(reactionLatencyMs)} ms`;
  finish({ success: 'Target hit. Trial complete.', premature: 'Too soon. Wait for green.',
    wrong: 'Incorrect click. Aim for the target.', expired: 'Response window expired.' }[outcome]);
});
let practiceIndex = 0;
document.querySelector<HTMLFormElement>('#practice-controls')!.addEventListener('submit', event => event.preventDefault());
document.querySelector<HTMLButtonElement>('#start')!.addEventListener('click', () => {
  const level = Number(document.querySelector<HTMLSelectElement>('#practice-level')!.value) as 1 | 2 | 3 | 4 | 5;
  const plan = createPlan({ ...defaultConfig, levels: [level], trialsPerLevel: 1, seed: `practice-${practiceIndex++}` });
  environment.prepare(plan[0]!, 1, 1);
  environment.start();
});
document.querySelector<HTMLElement>('#rules')!.textContent = visualReaction.instructions;
environment.prepare(createPlan({ ...defaultConfig, levels: [1], trialsPerLevel: 1 })[0]!, 1, 1);
window.addEventListener('resize', () => draw());
