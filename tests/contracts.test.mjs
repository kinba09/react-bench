import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runBenchmark } from '../dist/runner.js';
import { defaultConfig } from '../dist/registry.js';

const quickConfig = { ...defaultConfig, levels: [5], trialsPerLevel: 1,
  initialDelayMs: [100, 200], responseWindowsMs: [300, 300, 300, 300, 300] };

test('documented CLI writes offline results and refuses to overwrite them', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reactbench-cli-'));
  const configPath = join(directory, 'config.json');
  const outputPath = join(directory, 'output');
  const exec = promisify(execFile);
  try {
    await writeFile(configPath, JSON.stringify(quickConfig));
    const args = ['dist/cli.js', 'run', '--config', configPath, '--output', outputPath];
    const result = await exec(process.execPath, args);
    assert.match(result.stdout, /1 \/ 1 correct/);
    const saved = await readFile(join(outputPath, 'results.json'), 'utf8');
    assert.equal(JSON.parse(saved).comparisonClass, 'control-only');
    assert.equal(JSON.parse(saved).benchmark.version, '0.1.0');
    assert.equal(JSON.parse(saved).benchmark.playwrightVersion, '1.60.0');
    assert.equal(JSON.parse(saved).agent.adapterVersion, '0.1.0');
    assert.match(JSON.parse(saved).benchmark.gitCommit, /^[a-f0-9]{40}$/);
    assert.equal(typeof JSON.parse(saved).benchmark.trackedChanges, 'boolean');
    await assert.rejects(exec(process.execPath, args), error => {
      assert.match(error.stderr, /EEXIST/);
      return true;
    });
    assert.equal(await readFile(join(outputPath, 'results.json'), 'utf8'), saved);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('seed replay preserves scenarios, not fabricated identical wall-clock timings', { timeout: 15_000 }, async () => {
  const first = await runBenchmark({ config: quickConfig });
  const second = await runBenchmark({ config: quickConfig });
  assert.deepEqual(first.trials.map(x => x.scenario), second.trials.map(x => x.scenario));
  assert.notEqual(first.runId, second.runId);
  assert.equal(first.trials[0].outcome, 'success');
  assert.equal(second.trials[0].outcome, 'success');
  assert.ok(first.trials[0].timing.reactionLatencyMs >= 0);
  assert.ok(second.trials[0].timing.reactionLatencyMs >= 0);
});

test('visual adapter receives image/input capabilities without privileged state', { timeout: 10_000 }, async () => {
  let prepares = 0;
  let runs = 0;
  const report = await runBenchmark({ config: quickConfig, adapterFactory: () => ({
    metadata: { name: 'no-action-protocol-fixture', model: null, access: 'visual' },
    async prepare(context) {
      prepares++;
      assert.equal('oracle' in context, false);
      assert.equal('page' in context, false);
      assert.equal('scenario' in context, false);
      assert.equal('seed' in context, false);
      assert.match(context.instructions, /Wait while the target is red/);
      const image = context.observe();
      assert.deepEqual([...image.image.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(image.width, 1280);
      assert.equal(image.height, 720);
      await assert.rejects(context.input.click(20, 20), /preparation/);
    },
    async run(context) { runs++; assert.equal('oracle' in context, false); },
  }) });
  assert.equal(prepares, 1);
  assert.equal(runs, 1);
  assert.equal(report.comparisonClass, 'visual');
  assert.equal(report.trials[0].outcome, 'expired');
  assert.ok(report.trials[0].observations.some(x => x.deliveries.length));
});

for (const [name, override] of Object.entries({
  'duplicate levels': { levels: [1, 1] },
  'unknown category': { category: 'target-acquisition' },
  'empty seed': { seed: '' },
  'zero capture rate': { screenshotsPerSecond: 0 },
  'reversed delays': { initialDelayMs: [4000, 1000] },
  'missing window': { responseWindowsMs: [1000] },
  'unknown option': { speed: 2 },
})) {
  test(`rejects ${name} at the runner boundary`, async () => {
    await assert.rejects(runBenchmark({ config: { ...defaultConfig, ...override } }));
  });
}
