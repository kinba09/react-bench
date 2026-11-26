import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { runBenchmark } from '../dist/runner.js';
import { OracleAdapter } from '../dist/adapters/oracle.js';
import { createPlan, defaultConfig, defaultInhibitoryControlConfig } from '../dist/registry.js';
import { grade } from '../dist/grader.js';

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
    assert.equal('screenshotsPerSecond' in report.config, false);
    assert.equal(report.schemaVersion, 2);
    assert.deepEqual(report.summary.byLevel.map(x => [x.level, x.total]), [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]]);
    for (const trial of report.trials) {
      assert.equal(trial.outcome, 'success');
      assert.ok(trial.scenario.initialDelayMs >= 1000 && trial.scenario.initialDelayMs <= 4000);
      assert.equal(trial.scenario.responseWindowMs, [5000, 4000, 3000, 2000, 1000][trial.scenario.level - 1]);
      assert.ok(trial.timing.reactionLatencyMs >= 0);
      assert.equal(trial.timing.measurement, 'software-activation-to-input-handler');
      assert.equal(trial.timing.modelProcessingMs, null);
      assert.ok(trial.timing.preparationMs >= 0);
      assert.equal('observations' in trial, false);
      const active = trial.events.find(x => x.type === 'activated');
      const click = trial.events.find(x => x.type === 'action-registered');
      assert.equal(active.clock, 'browser-performance');
      assert.equal(click.clock, active.clock);
      assert.equal(trial.timing.reactionLatencyMs, click.atMs - active.atMs);
      assert.equal(click.inputTrusted, true);
      assert.equal(trial.actions.length, 1);

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

test('plans a seeded go, no-go and delayed-stop cue per level with the specified response windows', () => {
  const first = createPlan(defaultInhibitoryControlConfig);
  const replay = createPlan(defaultInhibitoryControlConfig);
  assert.equal(first.length, 15);
  assert.deepEqual(first, replay);
  assert.equal(new Set(first.map(trial => trial.id)).size, first.length);
  for (const level of [1, 2, 3, 4, 5]) {
    const trials = first.filter(trial => trial.level === level);
    assert.deepEqual(trials.map(trial => trial.condition).sort(), ['delayed-stop', 'go', 'no-go']);
    assert.ok(trials.every(trial => trial.category === 'inhibitory-control'));
    assert.ok(trials.every(trial => trial.responseWindowMs === [5000, 4000, 3000, 2000, 1000][level - 1]));
    assert.ok(trials.every(trial => trial.initialDelayMs >= 1000 && trial.initialDelayMs <= 4000));
  }
});

class InhibitoryOutcomeAdapter extends OracleAdapter {
  constructor(mode) { super(); this.mode = mode; }
  metadata = { name: 'inhibitory-outcome-fixture', model: null, access: 'privileged-oracle' };
  async run(context) {
    if (this.mode === 'premature') {
      const state = await context.oracle.snapshot();
      await context.input.click(state.target.x, state.target.y);
      return;
    }
    if (!await this.waitForActive(context)) return;
    if (this.mode === 'withhold' || this.mode === 'omit') return;
    const state = await context.oracle.snapshot();
    await context.input.click(this.mode === 'wrong' ? 5 : state.target.x, this.mode === 'wrong' ? 5 : state.target.y);
  }
}

test('reports go responses, go omissions, forbidden clicks, and successful withholding through the runner', { timeout: 30_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-inhibitory-'));
  const config = { ...defaultInhibitoryControlConfig, seed: 'inhibitory-outcomes', levels: [5], trialsPerLevel: 4,
    conditions: ['go', 'no-go'], initialDelayMs: [100, 100], responseWindowsMs: [250, 250, 250, 250, 250] };
  const plan = createPlan(config);
  const modes = new Map(plan.map(trial => [trial.id,
    trial.condition === 'go' ? ['respond', 'omit', 'wrong', 'premature'][trial.repetition - 1]
      : trial.repetition === 2 ? 'forbidden-click' : 'withhold']));
  let adapterIndex = 0;
  try {
    const report = await runBenchmark({ config, outputDir: output, adapterFactory: () => {
      const mode = modes.get(plan[adapterIndex++]?.id);
      return new InhibitoryOutcomeAdapter(mode);
    } });
    assert.equal(report.category, 'inhibitory-control');
    assert.equal(report.trials.length, 8);
    assert.equal(report.summary.correct, 4);
    assert.deepEqual(report.summary.inhibitoryControl.byCondition.map(row => [row.condition, row.correct, row.total]), [
      ['go', 1, 4], ['no-go', 3, 4],
    ]);
    assert.deepEqual(report.summary.inhibitoryControl.byLevel.map(row => [row.level, ...row.byCondition.map(condition => [condition.condition, condition.correct, condition.total])]), [
      [5, ['go', 1, 4], ['no-go', 3, 4]],
    ]);
    assert.equal(report.summary.inhibitoryControl.byCondition[0].medianReactionLatencyMs,
      report.trials.find(trial => trial.conditionOutcome === 'go-response').timing.reactionLatencyMs);
    assert.equal(report.summary.inhibitoryControl.byCondition[1].medianReactionLatencyMs, null);
    assert.deepEqual(report.summary.inhibitoryControl.outcomes, {
      'go-response': 1, 'go-omission': 1, 'go-wrong-click': 1, 'go-premature-click': 1, 'forbidden-click': 1, withheld: 3,
      'pre-stop-click': 0, 'post-stop-click': 0, 'stop-withheld': 0,
    });

    const goResponse = report.trials.find(trial => trial.conditionOutcome === 'go-response');
    const goOmission = report.trials.find(trial => trial.conditionOutcome === 'go-omission');
    const goWrong = report.trials.find(trial => trial.conditionOutcome === 'go-wrong-click');
    const goPremature = report.trials.find(trial => trial.conditionOutcome === 'go-premature-click');
    const forbiddenClick = report.trials.find(trial => trial.conditionOutcome === 'forbidden-click');
    const withheld = report.trials.filter(trial => trial.conditionOutcome === 'withheld');
    assert.equal(goResponse.outcome, 'success');
    assert.ok(goResponse.timing.reactionLatencyMs >= 0);
    assert.equal(goResponse.actions.length, 1);
    assert.equal(goOmission.outcome, 'expired');
    assert.equal(goOmission.timing.reactionLatencyMs, null);
    assert.equal(goOmission.actions.length, 0);
    assert.equal(goWrong.outcome, 'wrong');
    assert.equal(goWrong.timing.reactionLatencyMs, null);
    assert.equal(goWrong.actions.length, 1);
    assert.equal(goPremature.outcome, 'premature');
    assert.equal(goPremature.timing.reactionLatencyMs, null);
    assert.equal(goPremature.actions.length, 1);
    assert.equal(forbiddenClick.outcome, 'wrong');
    assert.equal(forbiddenClick.timing.reactionLatencyMs, null);
    assert.equal(forbiddenClick.actions.length, 1);
    assert.ok(withheld.every(trial => trial.outcome === 'success'));
    assert.ok(withheld.every(trial => trial.timing.reactionLatencyMs === null));
    assert.ok(withheld.every(trial => trial.actions.length === 0));
    for (const trial of [goOmission, ...withheld]) {
      const active = trial.events.find(event => event.type === 'activated');
      const expired = trial.events.find(event => event.type === 'expired');
      assert.ok(expired.atMs >= active.deadlineAtMs);
      assert.equal(trial.events.some(event => event.type === 'action-registered'), false);
    }
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /By cue condition/);
    assert.match(html, /Go · green/);
    assert.match(html, /No-go · red/);
    assert.match(html, /Go omissions: 1/);
    assert.match(html, /Forbidden clicks: 1/);
    assert.match(html, /go-wrong-click/);
    assert.match(html, /go-premature-click/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('does not register actions at or beyond the cue deadline in the runner report', { timeout: 15_000 }, async () => {
  class DeadlineAdapter extends OracleAdapter {
    metadata = { name: 'inhibitory-deadline-fixture', model: null, access: 'privileged-oracle' };
    async run(context) {
      if (!await this.waitForActive(context)) return;
      const state = await context.oracle.snapshot();
      const activation = state.events.find(event => event.type === 'activated');
      await sleep(Math.max(0, activation.deadlineAtMs - state.nowMs - 1));
      await context.input.click(state.target.x, state.target.y);
    }
  }
  const config = { ...defaultInhibitoryControlConfig, seed: 'inhibitory-deadline', levels: [5], trialsPerLevel: 1,
    conditions: ['go', 'no-go'], initialDelayMs: [100, 100], responseWindowsMs: [120, 120, 120, 120, 120] };
  const report = await runBenchmark({ config, adapterFactory: () => new DeadlineAdapter() });
  assert.equal(report.trials.length, 2);
  for (const trial of report.trials) {
    const activation = trial.events.find(event => event.type === 'activated');
    const registered = trial.events.find(event => event.type === 'action-registered');
    if (registered) {
      assert.ok(registered.atMs < activation.deadlineAtMs);
      assert.equal(trial.conditionOutcome, trial.scenario.condition === 'go' ? 'go-response' : 'forbidden-click');
    } else {
      const expired = trial.events.find(event => event.type === 'expired');
      assert.ok(expired.atMs >= activation.deadlineAtMs);
      assert.equal(trial.conditionOutcome, trial.scenario.condition === 'go' ? 'go-omission' : 'withheld');
      assert.equal(trial.timing.reactionLatencyMs, null);
    }
  }
});

test('rejects go clicks registered at the response-window deadline', () => {
  const scenarios = createPlan({ ...defaultInhibitoryControlConfig, levels: [5], trialsPerLevel: 1 });
  const go = scenarios.find(trial => trial.condition === 'go');
  const noGo = scenarios.find(trial => trial.condition === 'no-go');
  const activated = { trialId: go.id, type: 'activated', atMs: 100, clock: 'browser-performance', phase: 'active', deadlineAtMs: 200 };
  const justBefore = { ...activated, type: 'action-registered', atMs: 199.999, hit: true };
  const atDeadline = { ...activated, type: 'action-registered', atMs: 200, hit: true };
  assert.equal(grade([activated, justBefore], go).conditionOutcome, 'go-response');
  assert.equal(grade([activated, justBefore], go).reactionLatencyMs, 99.999);
  assert.equal(grade([activated, atDeadline], go).conditionOutcome, 'go-omission');
  assert.equal(grade([activated, atDeadline], go).reactionLatencyMs, null);
  assert.equal(grade([activated, justBefore], noGo).conditionOutcome, 'forbidden-click');
  assert.equal(grade([activated, atDeadline], noGo).conditionOutcome, 'withheld');
});
