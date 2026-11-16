import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runBenchmark } from '../dist/runner.js';
import { OracleAdapter } from '../dist/adapters/oracle.js';
import { defaultConfig } from '../dist/registry.js';

test('runs the real five-level Visual Reaction profile through browser input and exports honest results', { timeout: 120_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-test-'));
  try {
    const report = await runBenchmark({ config: defaultConfig, outputDir: output });
    assert.equal(report.trials.length, 15);
    assert.equal(report.agent.access, 'privileged-oracle');
    assert.equal(report.comparisonClass, 'control-only');
    assert.equal(report.summary.correct, 15);
    assert.equal(report.summary.p95.status, 'insufficient-samples');
    assert.equal(report.environment.viewport.width, 1280);
    assert.equal(report.environment.viewport.height, 720);
    assert.equal(report.environment.deviceScaleFactor, 1);
    assert.equal(report.config.screenshotsPerSecond, 2);
    assert.deepEqual(report.summary.byLevel.map(x => [x.level, x.total]), [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]]);
    for (const trial of report.trials) {
      assert.equal(trial.outcome, 'success');
      assert.ok(trial.scenario.initialDelayMs >= 1000 && trial.scenario.initialDelayMs <= 4000);
      assert.equal(trial.scenario.responseWindowMs, [5000, 4000, 3000, 2000, 1000][trial.scenario.level - 1]);
      assert.ok(trial.timing.reactionLatencyMs >= 0);
      assert.equal(trial.timing.modelProcessingMs, null);
      assert.ok(trial.timing.preparationMs >= 0);
      assert.ok(trial.observations.length >= 2);
      const active = trial.events.find(x => x.type === 'activated');
      const click = trial.events.find(x => x.type === 'action-registered');
      assert.equal(active.clock, 'browser-performance');
      assert.equal(click.clock, active.clock);
      assert.equal(trial.timing.reactionLatencyMs, click.atMs - active.atMs);
      assert.equal(click.inputTrusted, true);
      assert.equal(trial.actions.length, 1);
      for (const frame of trial.observations) {
        assert.ok(frame.returnedAtMs >= frame.requestedAtMs);
        assert.equal(frame.clock, 'runner-performance');
        assert.equal(frame.exactCaptureAtMs, null);
      }
    }
    const saved = JSON.parse(await readFile(join(output, 'results.json'), 'utf8'));
    assert.equal(saved.runId, report.runId);
    const lines = (await readFile(join(output, 'trials.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 15);
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /Control baseline/);
    assert.match(html, /insufficient samples/i);
    assert.match(html, /15 \/ 15/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

class OutcomeAdapter extends OracleAdapter {
  constructor(mode) { super(); this.mode = mode; }
  metadata = { name: 'scripted-test-fixture', model: null, access: 'privileged-oracle' };
  async run(context) {
    if (this.mode === 'expired') return;
    if (this.mode !== 'premature') await this.waitForActive(context);
    const state = await context.oracle.snapshot();
    const target = state.target;
    await context.input.click(this.mode === 'wrong' ? 5 : target.x, this.mode === 'wrong' ? 5 : target.y);
    await context.input.click(target.x, target.y);
  }
}

for (const outcome of ['premature', 'wrong', 'expired']) {
  test(`grades ${outcome} browser behavior without allowing a second click to rescue it`, { timeout: 15_000 }, async () => {
    const config = { ...defaultConfig, seed: `failure-${outcome}`, levels: [5], trialsPerLevel: 1 };
    const report = await runBenchmark({ config, adapterFactory: () => new OutcomeAdapter(outcome) });
    const trial = report.trials[0];
    assert.equal(trial.outcome, outcome);
    assert.equal(report.summary.correct, 0);
    assert.equal(trial.actions.length, outcome === 'expired' ? 0 : 1);
    assert.equal(trial.timing.reactionLatencyMs, null);
    assert.equal(report.summary.medianReactionLatencyMs, null);
    assert.equal(report.summary.failures[outcome], 1);
    assert.equal(trial.events.some(x => x.type === 'action-registered'), outcome !== 'expired');
  });
}
