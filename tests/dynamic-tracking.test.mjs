import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPlan, dynamicTrackingObjectCounts, dynamicTrackingSpeedPxPerSecond, dynamicTrackingTargetRadiusPx } from '../dist/registry.js';
import { runBenchmark } from '../dist/runner.js';
import { OracleAdapter } from '../dist/adapters/oracle.js';

test('plans three seeded trials at each visible Dynamic Tracking level with constant motion settings', async () => {
  const config = JSON.parse(await readFile(new URL('../configs/dynamic-tracking.json', import.meta.url), 'utf8'));
  const first = createPlan(config);
  const replay = createPlan(config);
  assert.equal(first.length, 9);
  assert.deepEqual(first, replay);
  for (const level of [1, 2, 3]) {
    const trials = first.filter(trial => trial.level === level);
    assert.equal(trials.length, 3);
    for (const trial of trials) {
      assert.equal(trial.category, 'dynamic-tracking');
      assert.equal(trial.clickWindowMs, 10_000);
      assert.equal(trial.objects.length, dynamicTrackingObjectCounts[level]);
      assert.equal(trial.objects.filter(object => object.role === 'required').length, 1);
      assert.equal(trial.objects.filter(object => object.role === 'distractor').length, dynamicTrackingObjectCounts[level] - 1);
      for (const object of trial.objects) {
        assert.equal(object.radius, dynamicTrackingTargetRadiusPx);
        assert.ok(Math.abs(Math.hypot(object.velocityX, object.velocityY) - dynamicTrackingSpeedPxPerSecond) < 1e-9);
      }
    }
  }
  assert.throws(() => createPlan({ ...config, levels: [4] }), /levels must contain unique integers from 1 to 3/);
});

const quickConfig = { category: 'dynamic-tracking', seed: 'reactbench-v1', levels: [1, 2, 3],
  trialsPerLevel: 1, screenshotsPerSecond: 2, clickWindowMs: 650 };

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
      const start = trial.events.find(event => event.type === 'started');
      const click = trial.events.find(event => event.type === 'action-registered');
      assert.equal(click.clock, start.clock);
      assert.equal(click.requiredTargetId, trial.scenario.requiredTargetId);
      assert.equal(click.clickedObjectId, trial.scenario.requiredTargetId);
      assert.equal(click.objects.length, trial.scenario.objects.length);
      assert.equal(trial.actions.length, 1);
      assert.equal(trial.timing.measurement, 'trial-start-to-input-handler');
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

test('grades the first incorrect moving-object click and discards later clicks', { timeout: 15_000 }, async () => {
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
    config: { ...quickConfig, levels: [2], clickWindowMs: 800 },
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
