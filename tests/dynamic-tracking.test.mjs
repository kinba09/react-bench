import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPlan, dynamicTrackingObjectCounts, dynamicTrackingSpeedPxPerSecond, dynamicTrackingTargetRadiusPx } from '../dist/registry.js';
import { runBenchmark } from '../dist/runner.js';
import { OracleAdapter } from '../dist/adapters/oracle.js';
import { chromium } from 'playwright';
import { startServer } from '../dist/server.js';

test('hides moving targets until the seeded wait completes', { timeout: 10_000 }, async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(window.reactBenchEnvironment));
    const scenario = createPlan({ category: 'dynamic-tracking', seed: 'hidden-preview', levels: [1],
      trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 1000, initialDelayMs: [400, 400] })[0];
    await page.evaluate(scenario => window.reactBenchEnvironment.prepare(scenario, 1, 1), scenario);
    const pixel = () => page.evaluate(() => {
      const scene = window.reactBenchEnvironment.snapshot();
      const canvas = document.querySelector('#arena');
      const rect = canvas.getBoundingClientRect();
      return [...canvas.getContext('2d').getImageData(scene.target.x - rect.left, scene.target.y - rect.top, 1, 1).data];
    });
    assert.deepEqual(await pixel(), [248, 250, 252, 255]);
    await page.evaluate(() => window.reactBenchEnvironment.start());
    assert.equal(await page.evaluate(() => window.reactBenchEnvironment.snapshot().phase), 'waiting');
    assert.deepEqual(await pixel(), [248, 250, 252, 255]);
    await page.waitForFunction(() => window.reactBenchEnvironment.snapshot().phase === 'active');
    const events = await page.evaluate(() => window.reactBenchEnvironment.snapshot().events);
    const started = events.find(event => event.type === 'started');
    const active = events.find(event => event.type === 'activated');
    assert.equal(started.plannedActivationAtMs - started.atMs, 400);
    assert.ok(active.atMs >= started.plannedActivationAtMs);
    assert.equal(active.deadlineAtMs - active.atMs, 1000);
    assert.notDeepEqual(await pixel(), [248, 250, 252, 255]);
  } finally { await browser.close(); await server.close(); }
});

test('replays a seeded trajectory through real Chromium at matched elapsed motion times', { timeout: 15_000 }, async () => {
  let config;
  for (let index = 0; index < 300; index++) {
    const candidate = { category: 'dynamic-tracking', seed: `motion-replay-${index}`, levels: [1],
      trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 1000, initialDelayMs: [100, 200] };
    const object = createPlan(candidate)[0].objects[0];
    if (object.u > 0.4 && object.u < 0.6 && object.v > 0.4 && object.v < 0.6) { config = candidate; break; }
  }
  assert.ok(config);
  const samples = [];
  class SampleMotion extends OracleAdapter {
    metadata = { name: 'motion-replay-fixture', model: null, access: 'privileged-oracle' };
    async prepare(context) { this.initial = await context.oracle.snapshot(); }
    async run(context) {
      await this.waitForActive(context);
      await sleep(120);
      samples.push({ initial: this.initial, moving: await context.oracle.snapshot() });
    }
  }
  const first = await runBenchmark({ config, adapterFactory: () => new SampleMotion() });
  const second = await runBenchmark({ config, adapterFactory: () => new SampleMotion() });
  assert.deepEqual(first.trials[0].scenario, second.trials[0].scenario);
  const velocity = first.trials[0].scenario.objects[0];
  const normalized = samples.map(({ initial, moving }) => {
    const activation = moving.events.find(event => event.type === 'activated');
    const elapsed = (moving.nowMs - activation.atMs) / 1000;
    assert.ok(elapsed >= 0.12 && elapsed < 0.5, 'sample the middle-of-field segment before a boundary bounce');
    assert.ok(Math.abs(moving.target.x - initial.target.x - velocity.velocityX * elapsed) < 1e-6);
    assert.ok(Math.abs(moving.target.y - initial.target.y - velocity.velocityY * elapsed) < 1e-6);
    return { x: moving.target.x - velocity.velocityX * (elapsed - 0.12),
      y: moving.target.y - velocity.velocityY * (elapsed - 0.12) };
  });
  assert.ok(Math.abs(normalized[0].x - normalized[1].x) < 1e-6);
  assert.ok(Math.abs(normalized[0].y - normalized[1].y) < 1e-6);
});

test('plans three seeded trials at every Dynamic Tracking level with constant motion settings', async () => {
  const config = JSON.parse(await readFile(new URL('../configs/dynamic-tracking.json', import.meta.url), 'utf8'));
  const first = createPlan(config);
  const replay = createPlan(config);
  assert.equal(first.length, 15);
  assert.deepEqual(first, replay);
  for (const level of [1, 2, 3, 4, 5]) {
    const trials = first.filter(trial => trial.level === level);
    assert.equal(trials.length, 3);
    for (const trial of trials) {
      assert.equal(trial.category, 'dynamic-tracking');
      assert.equal(trial.clickWindowMs, 10_000);
      assert.ok(level >= 4 ? trial.initialDelayMs === 0 : trial.initialDelayMs >= 1000 && trial.initialDelayMs <= 4000);
      assert.equal(trial.objects.length, dynamicTrackingObjectCounts[level]);
      assert.equal(trial.watchDurationMs, level >= 4 ? 1500 : 0);
      assert.equal(trial.hiddenDurationMs, level === 4 ? 1000 : level === 5 ? 2000 : 0);
      assert.equal(trial.objects.filter(object => object.role === 'required').length, 1);
      assert.equal(trial.objects.filter(object => object.role === 'distractor').length, dynamicTrackingObjectCounts[level] - 1);
      for (const object of trial.objects) {
        assert.equal(object.radius, dynamicTrackingTargetRadiusPx);
        assert.ok(Math.abs(Math.hypot(object.velocityX, object.velocityY) - dynamicTrackingSpeedPxPerSecond) < 1e-9);
      }
    }
  }
  assert.throws(() => createPlan({ ...config, levels: [6] }), /levels must contain unique integers from 1 to 5/);
});

test('plans the occlusion levels with 30 and 60 moving objects and fixed phase durations', () => {
  const trials = createPlan({ category: 'dynamic-tracking', seed: 'occlusion-plan', levels: [4, 5],
    trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 10_000, initialDelayMs: [1000, 4000] });
  assert.deepEqual(trials.map(trial => [trial.level, trial.objects.length, trial.watchDurationMs, trial.hiddenDurationMs])
    .sort((a, b) => a[0] - b[0]), [
    [4, 30, 1500, 1000], [5, 60, 1500, 2000],
  ]);
});

test('records Watch, Hidden, and reappearance timing and keeps the target hidden during occlusion', { timeout: 15_000 }, async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(window.reactBenchEnvironment));
    for (const level of [4, 5]) {
      const scenario = createPlan({ category: 'dynamic-tracking', seed: `occlusion-phases-${level}`, levels: [level],
        trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 10_000, initialDelayMs: [100, 100] })[0];
      await page.evaluate(scenario => window.reactBenchEnvironment.prepare(scenario, 1, 1), scenario);
      await page.evaluate(() => window.reactBenchEnvironment.start());
      await page.waitForFunction(() => window.reactBenchEnvironment.snapshot().phase === 'watching');
      const watching = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
      assert.equal(watching.events.find(event => event.type === 'started').phase, 'watching');
      await page.waitForFunction(() => window.reactBenchEnvironment.snapshot().phase === 'hidden');
      const hidden = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
      const hiddenEvent = hidden.events.find(event => event.type === 'phase-transition');
      assert.equal(hiddenEvent.phase, 'hidden');
      assert.ok(hiddenEvent.atMs - watching.events.find(event => event.type === 'started').atMs >= 1400);
      assert.ok(hiddenEvent.atMs - watching.events.find(event => event.type === 'started').atMs < 1900);
      const hiddenSeconds = scenario.hiddenDurationMs / 1000;
      assert.match(await page.locator('#phase-countdown').textContent(), new RegExp(`Reappears in ${hiddenSeconds} s`));
      assert.equal(await page.locator('#phase-countdown').evaluate(element => getComputedStyle(element).fontSize), '11px');
      const invisibleTarget = hidden.objects.find(object => object.id === hidden.requiredTargetId);
      const pixel = await page.evaluate(({ x, y }) => {
        const canvas = document.querySelector('#arena');
        const rect = canvas.getBoundingClientRect();
        return [...canvas.getContext('2d').getImageData(x - rect.left, y - rect.top, 1, 1).data];
      }, invisibleTarget);
      assert.deepEqual(pixel, [248, 250, 252, 255]);
      await page.waitForFunction(() => window.reactBenchEnvironment.snapshot().phase === 'active');
      const active = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
      const activation = active.events.find(event => event.type === 'activated');
      assert.ok(activation.atMs - hiddenEvent.atMs >= scenario.hiddenDurationMs - 150);
      assert.ok(activation.atMs - hiddenEvent.atMs < scenario.hiddenDurationMs + 400);
      assert.equal(activation.deadlineAtMs - activation.atMs, 10_000);
      assert.equal(await page.locator('#phase-countdown').isHidden(), true);
      assert.match(await page.locator('#status').textContent(), /^Click · \d+ s$/);
      const target = active.objects.find(object => object.id === active.requiredTargetId);
      await page.mouse.click(target.x, target.y);
      const finished = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
      const click = finished.events.find(event => event.type === 'action-registered');
      assert.equal(click.phase, 'active');
      assert.equal(click.clickedObjectId, scenario.requiredTargetId);
    }
  } finally { await browser.close(); await server.close(); }
});

test('fails clicks during Watch and Hidden without testing against invisible target positions', { timeout: 15_000 }, async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(window.reactBenchEnvironment));
    const scenario = createPlan({ category: 'dynamic-tracking', seed: 'premature-occlusion', levels: [4],
      trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 10_000, initialDelayMs: [100, 100] })[0];
    const clickDuring = async phase => {
      await page.evaluate(scenario => window.reactBenchEnvironment.prepare(scenario, 1, 1), scenario);
      await page.evaluate(() => window.reactBenchEnvironment.start());
      await page.waitForFunction(phase => window.reactBenchEnvironment.snapshot().phase === phase, phase);
      const state = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
      const target = state.objects.find(object => object.id === state.requiredTargetId);
      await page.mouse.click(target.x, target.y);
      return page.evaluate(() => window.reactBenchEnvironment.snapshot());
    };
    for (const phase of ['watching', 'hidden']) {
      const finished = await clickDuring(phase);
      const click = finished.events.find(event => event.type === 'action-registered');
      assert.equal(finished.phase, 'complete');
      assert.equal(click.phase, phase);
      assert.equal(click.hit, false);
      assert.equal(click.clickedObjectId, null);
      assert.deepEqual(click.objects, []);
    }
  } finally { await browser.close(); await server.close(); }
});

test('starts the response clock on reappearance and expires after the resumed click window', { timeout: 15_000 }, async () => {
  const report = await runBenchmark({ config: { ...quickConfig, levels: [5], clickWindowMs: 250 }, adapterFactory: () => ({
    metadata: { name: 'silent-occlusion-fixture', model: null, access: 'visual' },
    async prepare() {}, async run() {},
  }) });
  const trial = report.trials[0];
  const activation = trial.events.find(event => event.type === 'activated');
  const hidden = trial.events.find(event => event.type === 'phase-transition' && event.phase === 'hidden');
  const expired = trial.events.find(event => event.type === 'expired');
  assert.ok(hidden.atMs < activation.atMs);
  assert.equal(activation.deadlineAtMs - activation.atMs, 250);
  assert.ok(expired.atMs - activation.atMs >= 250);
  assert.equal(trial.outcome, 'expired');
  assert.equal(trial.scenario.objects.length, 60);
  assert.equal(report.summary.byLevel[0].objectsPerTrial, 60);
  assert.equal(trial.timing.reactionLatencyMs, null);
});

test('the privileged control reacquires the target and measures latency from reappearance', { timeout: 15_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-occlusion-'));
  try {
    const report = await runBenchmark({ config: { ...quickConfig, levels: [4], clickWindowMs: 750 }, outputDir: output });
    const trial = report.trials[0];
    const activation = trial.events.find(event => event.type === 'activated');
    const hidden = trial.events.find(event => event.type === 'phase-transition' && event.phase === 'hidden');
    const click = trial.events.find(event => event.type === 'action-registered');
    assert.equal(trial.outcome, 'success');
    assert.ok(hidden.atMs < activation.atMs);
    assert.equal(click.phase, 'active');
    assert.equal(click.clickedObjectId, trial.scenario.requiredTargetId);
    assert.equal(trial.timing.reactionLatencyMs, click.atMs - activation.atMs);
    const saved = JSON.parse((await readFile(join(output, 'trials.jsonl'), 'utf8')).trim());
    assert.deepEqual(saved.events.map(event => event.phase).filter(phase => ['watching', 'hidden', 'active'].includes(phase)),
      ['watching', 'hidden', 'active', 'active', 'active']);
  } finally { await rm(output, { recursive: true, force: true }); }
});

const quickConfig = { category: 'dynamic-tracking', seed: 'reactbench-v1', levels: [1, 2, 3],
  trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 650, initialDelayMs: [100, 200] };

test('runs all visible levels through the common oracle, logs, and category summary', { timeout: 20_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-dynamic-'));
  try {
    const report = await runBenchmark({ config: quickConfig, outputDir: output });
    assert.equal(report.category, 'dynamic-tracking');
    assert.equal(report.summary.category, 'dynamic-tracking');
    assert.equal(report.agent.access, 'privileged-oracle');
    assert.equal(report.comparisonClass, 'control-only');
    assert.equal(report.summary.correct, 3);
    assert.deepEqual(report.trials.map(trial => trial.scenario.objects.length).sort((a, b) => a - b), [1, 5, 15]);
    assert.ok(report.trials.every(trial => trial.outcome === 'success'));
    assert.equal(report.environment.targetRadiusPx, dynamicTrackingTargetRadiusPx);
    assert.equal(report.environment.movementSpeedPxPerSecond, dynamicTrackingSpeedPxPerSecond);
    for (const trial of report.trials) {
      const start = trial.events.find(event => event.type === 'activated');
      const click = trial.events.find(event => event.type === 'action-registered');
      assert.equal(click.clock, start.clock);
      assert.equal(click.requiredTargetId, trial.scenario.requiredTargetId);
      assert.equal(click.clickedObjectId, trial.scenario.requiredTargetId);
      assert.equal(click.objects.length, trial.scenario.objects.length);
      assert.equal(trial.actions.length, 1);
      assert.equal(trial.timing.measurement, 'software-activation-to-input-handler');
      assert.equal(trial.timing.reactionLatencyMs, click.atMs - start.atMs);
    }
    assert.deepEqual(report.summary.byLevel.map(row => [row.level, row.total, row.correct]), [[1, 1, 1], [2, 1, 1], [3, 1, 1]]);
    const saved = JSON.parse(await readFile(join(output, 'results.json'), 'utf8'));
    assert.equal(saved.category, 'dynamic-tracking');
    assert.equal(saved.summary.category, 'dynamic-tracking');
    const logs = (await readFile(join(output, 'trials.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(logs.length, 3);
    assert.ok(logs.every(trial => trial.events.find(event => event.type === 'action-registered').objects.length === trial.scenario.objects.length));
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /Dynamic Tracking/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('grades the first incorrect moving-object click at an occlusion level and discards later clicks', { timeout: 15_000 }, async () => {
  class WrongFirstAttempt extends OracleAdapter {
    metadata = { name: 'wrong-first-attempt-fixture', model: null, access: 'privileged-oracle' };
    async run(context) {
      await this.waitForActive(context);
      const state = await context.oracle.snapshot();
      const distractor = state.objects.find(object => object.role === 'distractor');
      const required = state.objects.find(object => object.id === state.requiredTargetId);
      await context.input.click(distractor.x, distractor.y);
      await context.input.click(required.x, required.y);
    }
  }
  const report = await runBenchmark({
    config: { ...quickConfig, levels: [4], clickWindowMs: 800 },
    adapterFactory: () => new WrongFirstAttempt(),
  });
  const trial = report.trials[0];
  const click = trial.events.find(event => event.type === 'action-registered');
  assert.equal(trial.outcome, 'wrong');
  assert.equal(report.summary.failures.wrong, 1);
  assert.equal(trial.actions.length, 1);
  assert.match(click.clickedObjectId, /^distractor-/);
  assert.equal(click.hit, false);
});

test('grades against moving ground truth at click registration when an observation is stale', { timeout: 15_000 }, async () => {
  class StaleObservation extends OracleAdapter {
    metadata = { name: 'stale-observation-fixture', model: null, access: 'privileged-oracle' };
    initialObservationId;
    async prepare(context) { this.initialObservationId = context.observe()?.id; }
    async run(context) {
      await this.waitForActive(context);
      let image;
      do {
        image = context.observe();
        if (image?.id === this.initialObservationId) await sleep(30);
      } while (!image || image.id === this.initialObservationId);
      const observedTarget = (await context.oracle.snapshot()).objects.find(object => object.role === 'required');
      await sleep(400);
      await context.input.click(observedTarget.x, observedTarget.y, image.id);
    }
  }
  const report = await runBenchmark({
    config: { ...quickConfig, levels: [1], clickWindowMs: 2_000 },
    adapterFactory: () => new StaleObservation(),
  });
  const trial = report.trials[0];
  const click = trial.events.find(event => event.type === 'action-registered');
  const registeredTarget = click.objects.find(object => object.id === click.requiredTargetId);
  assert.equal(trial.outcome, 'wrong');
  assert.equal(click.clickedObjectId, null);
  assert.ok(Math.hypot(click.x - registeredTarget.x, click.y - registeredTarget.y) > registeredTarget.radius);
  const linkedFrame = trial.observations.find(frame => frame.id === trial.actions[0].observationId);
  assert.ok(linkedFrame);
  assert.ok(linkedFrame.deliveries.length > 0);
});

test('records required-response expiration without inventing a click', { timeout: 15_000 }, async () => {
  const report = await runBenchmark({ config: { ...quickConfig, levels: [3], clickWindowMs: 250,
    trialsPerLevel: 1 }, adapterFactory: () => ({
    metadata: { name: 'silent-fixture', model: null, access: 'visual' },
    async prepare() {}, async run() {},
  }) });
  const trial = report.trials[0];
  assert.equal(trial.outcome, 'expired');
  assert.equal(trial.events.some(event => event.type === 'expired'), true);
  assert.equal(trial.events.some(event => event.type === 'action-registered'), false);
  assert.equal(report.summary.failures.expired, 1);
});
