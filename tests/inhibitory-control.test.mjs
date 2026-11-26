import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { OracleAdapter } from '../dist/adapters/oracle.js';
import { grade } from '../dist/grader.js';
import { createPlan, defaultInhibitoryControlConfig, validateConfig } from '../dist/registry.js';
import { runBenchmark } from '../dist/runner.js';

test('samples reproducible stop delays within 20% of the nominal delay at each level', () => {
  const config = { ...defaultInhibitoryControlConfig, trialsPerLevel: 32 };
  const plan = createPlan(config);
  assert.deepEqual(createPlan(config), plan);
  for (const level of config.levels) {
    const stops = plan.filter(trial => trial.condition === 'delayed-stop' && trial.level === level);
    const nominal = [100, 250, 400, 550, 700][level - 1];
    assert.equal(stops.length, 32);
    assert.ok(new Set(stops.map(trial => trial.plannedStopDelayMs)).size > 1);
    for (const stop of stops) {
      assert.equal(stop.nominalStopDelayMs, nominal);
      assert.ok(stop.plannedStopDelayMs >= nominal * 0.8);
      assert.ok(stop.plannedStopDelayMs <= nominal * 1.2);
      assert.ok(stop.plannedStopDelayMs < stop.responseWindowMs);
    }
  }
  assert.throws(() => validateConfig({ ...config, responseWindowsMs: [5000, 4000, 3000, 2000, 840] }),
    /Level 5 response window must exceed the delayed-stop range/);
  assert.doesNotThrow(() => validateConfig({ ...config, conditions: ['go', 'no-go'],
    responseWindowsMs: [250, 250, 250, 250, 250] }));
});

test('grades clicks around the observed stop and response deadline', () => {
  const scenario = createPlan(defaultInhibitoryControlConfig).find(trial => trial.condition === 'delayed-stop');
  const event = (type, atMs, fields = {}) => ({ trialId: scenario.id, type, atMs, clock: 'browser-performance', phase: 'active', ...fields });
  const activation = event('activated', 100, { plannedStopAtMs: 300, deadlineAtMs: 1000 });
  const stop = event('stop-signal', 320, { plannedStopAtMs: 300 });
  const expires = event('expired', 1000, { deadlineAtMs: 1000 });
  assert.notEqual(grade([activation, stop], scenario).outcome, 'success');
  assert.equal(grade([activation, event('action-registered', 315)], scenario).conditionOutcome, 'pre-stop-click');
  assert.equal(grade([activation, stop, event('action-registered', 320)], scenario).conditionOutcome, 'post-stop-click');
  assert.equal(grade([activation, stop, event('action-registered', 999.999)], scenario).conditionOutcome, 'post-stop-click');
  assert.equal(grade([activation, stop, event('action-registered', 1000)], scenario).conditionOutcome, 'stop-withheld');
  assert.equal(grade([activation, stop, expires], scenario).conditionOutcome, 'stop-withheld');
});

test('records pre-stop and post-stop failures and withholding through Chromium input and exports', { timeout: 15_000 }, async () => {
  class StopOutcomeAdapter extends OracleAdapter {
    async run(context) {
      const initial = await context.oracle.snapshot();
      const mode = modes.get(initial.trialId);
      if (mode === 'stop-withheld') return super.run(context);
      if (!await this.waitForActive(context)) return;
      let state = await context.oracle.snapshot();
      if (mode === 'post-stop-click') {
        while (state.phase === 'active' && !state.events.some(event => event.type === 'stop-signal')) {
          await sleep(10, undefined, { signal: context.signal });
          state = await context.oracle.snapshot();
        }
      }
      await context.input.click(state.target.x, state.target.y);
    }
  }
  const config = { ...defaultInhibitoryControlConfig, seed: 'model-stop-outcomes', levels: [4],
    conditions: ['delayed-stop'], trialsPerLevel: 3, initialDelayMs: [100, 100], responseWindowsMs: [300, 400, 600, 1000, 1000] };
  const modes = new Map(createPlan(config).map(trial =>
    [trial.id, ['pre-stop-click', 'post-stop-click', 'stop-withheld'][trial.repetition - 1]]));
  const outputDir = await mkdtemp(join(tmpdir(), 'reactbench-delayed-stop-'));
  try {
    const report = await runBenchmark({ config, outputDir, adapterFactory: () => new StopOutcomeAdapter() });
    assert.equal(report.comparisonClass, 'control-only');
    assert.equal(report.summary.correct, 1);
    assert.deepEqual(report.summary.inhibitoryControl.byCondition, [
      { condition: 'delayed-stop', total: 3, correct: 1, medianReactionLatencyMs: null },
    ]);
    for (const trial of report.trials) {
      const condition = modes.get(trial.id);
      assert.equal(trial.conditionOutcome, condition);
      assert.equal(report.summary.inhibitoryControl.outcomes[condition], 1);
      assert.equal(trial.timing.reactionLatencyMs, null);
      const activation = trial.events.find(event => event.type === 'activated');
      const signal = trial.events.find(event => event.type === 'stop-signal');
      const click = trial.events.find(event => event.type === 'action-registered');
      assert.equal(activation.plannedStopAtMs, activation.atMs + trial.scenario.plannedStopDelayMs);
      if (condition === 'pre-stop-click') {
        assert.equal(signal, undefined);
        assert.equal(click.inputTrusted, true);
      } else {
        assert.equal(signal.clock, activation.clock);
        assert.equal(signal.plannedStopAtMs, activation.plannedStopAtMs);
        assert.ok(signal.atMs >= activation.plannedStopAtMs && signal.atMs < activation.deadlineAtMs);
        if (condition === 'post-stop-click') {
          assert.ok(click.atMs >= signal.atMs && click.atMs < activation.deadlineAtMs);
          assert.equal(click.inputTrusted, true);
        } else {
          assert.equal(click, undefined);
          assert.equal(trial.actions.length, 0);
          assert.ok(trial.events.at(-1).atMs >= activation.deadlineAtMs);
        }
      }
    }
    const saved = JSON.parse(await readFile(join(outputDir, 'results.json'), 'utf8'));
    const lines = (await readFile(join(outputDir, 'trials.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(saved.trials, report.trials);
    assert.deepEqual(lines, report.trials);
    const html = await readFile(join(outputDir, 'report.html'), 'utf8');
    assert.match(html, /Delayed-stop withholding: 1 · Clicks before stop: 1 · Clicks after stop: 1/);
    assert.match(html, /Nominal delay.*Planned delay.*Observed delay/);
    const preStopTrial = report.trials.find(trial => trial.conditionOutcome === 'pre-stop-click');
    assert.match(html, new RegExp(`${preStopTrial.id}</td><td>550.0 ms</td><td>[0-9.]+ ms</td><td>Unavailable</td>`));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
