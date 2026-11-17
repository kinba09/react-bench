import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { runBenchmark } from '../dist/runner.js';
import { OracleAdapter } from '../dist/adapters/oracle.js';
import { createPlan, targetAcquisitionConfig } from '../dist/registry.js';
import { startServer } from '../dist/server.js';

test('runs Target Acquisition through Chromium and exports crowding and successful hit evidence', { timeout: 120_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-target-'));
  try {
    const report = await runBenchmark({ config: targetAcquisitionConfig, outputDir: output });
    assert.equal(report.category, 'target-acquisition');
    assert.equal(report.config.category, 'target-acquisition');
    assert.equal(report.trials.length, 15);
    assert.deepEqual(report.summary.byLevel.map(x => [x.level, x.total, x.objectsPerTrial]), [
      [1, 3, 6], [2, 3, 16], [3, 3, 36], [4, 3, 64], [5, 3, 100],
    ]);
    assert.equal(report.summary.correct, 15);
    assert.equal(report.comparisonClass, 'control-only');
    assert.equal(report.environment.acquisitionObjectSizePx, 26);
    for (const trial of report.trials) {
      assert.equal(trial.scenario.category, 'target-acquisition');
      assert.equal(trial.scenario.responseWindowMs, 10_000);
      assert.equal(trial.scenario.objectSizePx, 26);
      assert.equal(trial.scenario.objects.length, [6, 16, 36, 64, 100][trial.scenario.level - 1]);
      assert.equal(trial.scenario.objects.filter(item => item.matching).length, 1);
      assert.equal(trial.scenario.objects.find(item => item.matching).symbol, trial.scenario.reference.symbol);
      assert.equal(trial.outcome, 'success');
      const action = trial.events.find(item => item.type === 'action-registered');
      assert.equal(action.hit, true);
      assert.equal(trial.scenario.objects[action.objectIndex].matching, true);
      assert.ok(trial.timing.reactionLatencyMs >= 0);
    }
    const saved = JSON.parse(await readFile(join(output, 'results.json'), 'utf8'));
    assert.equal(saved.category, 'target-acquisition');
    assert.equal(saved.trials[0].scenario.category, 'target-acquisition');
    const lines = (await readFile(join(output, 'trials.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(JSON.parse(lines[0]).scenario.category, 'target-acquisition');
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /Target Acquisition/);
    assert.match(html, /100/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('replaying the same Target Acquisition seed reproduces scenarios and order', { timeout: 30_000 }, async () => {
  const config = { ...targetAcquisitionConfig, levels: [5], trialsPerLevel: 1, seed: 'target-replay' };
  const first = await runBenchmark({ config });
  const second = await runBenchmark({ config });
  assert.deepEqual(first.trials.map(item => item.scenario), second.trials.map(item => item.scenario));
  assert.equal(first.trials[0].outcome, 'success');
  assert.equal(second.trials[0].outcome, 'success');
});

class TargetChoiceAdapter extends OracleAdapter {
  constructor(mode) { super(); this.mode = mode; }
  metadata = { name: 'target-choice-test-fixture', model: null, access: 'privileged-oracle' };
  async run(context) {
    if (this.mode === 'expired') return;
    if (this.mode !== 'premature') await this.waitForActive(context);
    const state = await context.oracle.snapshot();
    const target = state.objects.find(item => item.matching);
    const wrong = state.objects.find(item => !item.matching);
    const choice = this.mode === 'wrong' ? wrong : target;
    await context.input.click(choice.x, choice.y);
    await context.input.click(target.x, target.y);
  }
}

test('the first wrong object click fails and a later correct click cannot rescue it', { timeout: 15_000 }, async () => {
  const config = { ...targetAcquisitionConfig, levels: [1], trialsPerLevel: 1, seed: 'target-wrong' };
  const report = await runBenchmark({ config, adapterFactory: () => new TargetChoiceAdapter('wrong') });
  const trial = report.trials[0];
  assert.equal(trial.outcome, 'wrong');
  assert.equal(trial.actions.length, 1);
  assert.equal(trial.events.filter(item => item.type === 'action-registered').length, 1);
  const action = trial.events.find(item => item.type === 'action-registered');
  assert.equal(action.hit, false);
  assert.equal(trial.scenario.objects[action.objectIndex].matching, false);
  assert.equal(report.summary.failures.wrong, 1);
});

test('a premature correct object click fails and cannot be rescued after activation', { timeout: 15_000 }, async () => {
  const config = { ...targetAcquisitionConfig, levels: [1], trialsPerLevel: 1, seed: 'target-premature' };
  const report = await runBenchmark({ config, adapterFactory: () => new TargetChoiceAdapter('premature') });
  const trial = report.trials[0];
  assert.equal(trial.outcome, 'premature');
  assert.equal(trial.actions.length, 1);
  assert.equal(trial.events.filter(item => item.type === 'action-registered').length, 1);
  assert.equal(trial.events.find(item => item.type === 'action-registered').hit, true);
  assert.equal(report.summary.failures.premature, 1);
});

test('an unclicked Target Acquisition board expires at its ten-second deadline', { timeout: 20_000 }, async () => {
  const config = { ...targetAcquisitionConfig, levels: [5], trialsPerLevel: 1, seed: 'target-expired' };
  const report = await runBenchmark({ config, adapterFactory: () => new TargetChoiceAdapter('expired') });
  const trial = report.trials[0];
  assert.equal(trial.outcome, 'expired');
  assert.equal(trial.actions.length, 0);
  assert.equal(trial.events.at(-1).type, 'expired');
  assert.ok(trial.events.at(-1).atMs >= trial.events.at(-1).deadlineAtMs);
  assert.equal(report.summary.failures.expired, 1);
});

test('the default Target Acquisition plan contains three trials at every agreed crowding level', () => {
  const plan = createPlan(targetAcquisitionConfig);
  assert.equal(targetAcquisitionConfig.trialsPerLevel, 3);
  assert.equal(plan.length, 15);
  for (const level of [1, 2, 3, 4, 5]) {
    const trials = plan.filter(scenario => scenario.level === level);
    assert.equal(trials.length, 3);
    assert.ok(trials.every(scenario => scenario.objects.length === [6, 16, 36, 64, 100][level - 1]));
  }
});

test('practice level labels follow the selected game', { timeout: 15_000 }, async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.url);
    await page.selectOption('#practice-category', 'target-acquisition');
    assert.deepEqual(await page.locator('#practice-level option').allTextContents(), [
      'Level 1 · 6 objects', 'Level 2 · 16 objects', 'Level 3 · 36 objects', 'Level 4 · 64 objects', 'Level 5 · 100 objects',
    ]);
    await page.selectOption('#practice-category', 'visual-reaction');
    assert.deepEqual(await page.locator('#practice-level option').allTextContents(), [
      'Level 1 · 5 seconds', 'Level 2 · 4 seconds', 'Level 3 · 3 seconds', 'Level 4 · 2 seconds', 'Level 5 · 1 second',
    ]);
    await page.selectOption('#practice-category', 'target-acquisition');
    await page.click('#start');
    const ready = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
    assert.equal(ready.phase, 'waiting');
    await page.mouse.click(ready.target.x, ready.target.y);
    assert.equal(await page.locator('#instruction').textContent(), 'Too soon. Wait for “Find the match.”');
  } finally {
    await browser.close();
    await server.close();
  }
});

test('a correct click after expiration cannot rescue an expired board', { timeout: 15_000 }, async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.url);
    await page.selectOption('#practice-category', 'target-acquisition');
    await page.click('#start');
    const active = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
    await page.waitForFunction(() => window.reactBenchEnvironment.snapshot().phase === 'complete', undefined, { timeout: 12_000 });
    await page.mouse.click(active.target.x, active.target.y);
    const finished = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
    assert.equal(finished.phase, 'complete');
    assert.equal(finished.events.at(-1).type, 'expired');
    assert.equal(finished.events.some(item => item.type === 'action-registered'), false);
    assert.equal(await page.locator('#result').textContent(), 'No response');
  } finally {
    await browser.close();
    await server.close();
  }
});

test('seeded board positions vary by seed while replaying one seed remains stable', () => {
  const config = { ...targetAcquisitionConfig, levels: [5], trialsPerLevel: 1, seed: 'positions-a' };
  const first = createPlan(config)[0];
  const replay = createPlan(config)[0];
  const otherSeed = createPlan({ ...config, seed: 'positions-b' })[0];
  assert.deepEqual(first.objects, replay.objects);
  assert.notDeepEqual(first.objects.map(item => [item.u, item.v]), otherSeed.objects.map(item => [item.u, item.v]));
});
