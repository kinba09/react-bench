import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startBrowserSession } from '../dist/session.js';
import { defaultConfig, createPlan } from '../dist/registry.js';
import { runBenchmark } from '../dist/runner.js';

const config = { ...defaultConfig, seed: 'browser-session-tests', levels: [1], trialsPerLevel: 3,
  initialDelayMs: [200, 200], responseWindowsMs: [1000, 1000, 1000, 1000, 1000] };
const display = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, userAgent: 'scripted-protocol-fixture' };

async function fixture(fn, selected = config) {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-session-'));
  const session = await startBrowserSession({ config: selected, outputDir: output });
  const browser = await chromium.launch();
  try { await fn({ session, browser, output }); }
  finally { await browser.close(); await session.close(); await rm(output, { recursive: true, force: true }); }
}

test('an external browser completes three scored trials and exports without benchmark images', { timeout: 20_000 }, async () => {
  await fixture(async ({ session, browser, output }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // Any accidental capture by this participant path fails the test.
    page.screenshot = () => { throw new Error('No screenshot feed is permitted.'); };
    await page.goto(session.url);
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => typeof window.reactBenchEnvironment), 'undefined');
    const plan = createPlan(config);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: `Start trial ${i + 1}`, exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
      const rect = await page.locator('#arena').boundingBox();
      const target = plan[i].target;
      if (i === 2) await mkdir(join(output, 'report.html')); // Fail final export, then exercise UI retry.
      await page.mouse.click(rect.x + rect.width * target.u, rect.y + rect.height * target.v);
      if (i < 2) {
        await page.getByText(`Trial ${i + 1} recorded.`, { exact: false }).waitFor();
        // Repeated task input after completion cannot rescue or rescore this trial.
        await page.mouse.click(rect.x + 5, rect.y + 5);
        await page.getByRole('button', { name: 'Prepare next trial', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready'
          && !document.querySelector('#session-start').disabled);
        const before = await page.locator('#status').textContent();
        await sleep(350);
        assert.equal(before, 'Ready');
        assert.equal(await page.locator('#status').textContent(), 'Ready');
      } else {
        await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
        await assert.rejects(readFile(join(output, 'results.json')), { code: 'ENOENT' });
        await rm(join(output, 'report.html'), { recursive: true });
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
      }
    }
    await page.getByText('3 / 3 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.status, 'complete');
    assert.equal(report.comparisonClass, 'visual');
    assert.equal(report.plannedTrials, 3);
    assert.equal(report.summary.correct, 3);
    assert.equal(report.environment.actionInterface, 'external-browser-tools');
    assert.equal(report.environment.browserVersion, null);
    assert.deepEqual(report.environment.viewport, display.viewport);
    assert.deepEqual(report.trials.map(trial => trial.scenario), plan);
    for (const trial of report.trials) {
      const activation = trial.events.find(event => event.type === 'activated');
      const click = trial.events.find(event => event.type === 'action-registered');
      assert.equal(click.inputTrusted, true);
      assert.equal(trial.timing.reactionLatencyMs, click.atMs - activation.atMs);
      assert.equal(trial.timing.preparationClock, 'browser-performance');
      assert.equal(trial.timing.modelProcessingMs, null);
      assert.equal('observations' in trial, false);
      assert.equal('measuredCaptureHz' in trial.timing, false);
      assert.deepEqual(trial.actions, []); // No invented runner dispatch telemetry for native inputs.
    }
    assert.deepEqual(JSON.parse(await readFile(join(output, 'results.json'), 'utf8')), report);
    assert.equal((await readFile(join(output, 'trials.jsonl'), 'utf8')).trim().split('\n').length, 3);
    const reportUrl = await page.getByRole('link', { name: 'Open report' }).getAttribute('href');
    const html = await (await fetch(new URL(reportUrl, session.url))).text();
    assert.match(html, /3 \/ 3/);
    assert.match(html, /own browser\/computer tools/);
    assert.doesNotMatch(html, /Achieved capture rate|screenshot\/action contract/);
    assert.equal(html, await readFile(join(output, 'report.html'), 'utf8'));
    await page.reload();
    await page.getByText('3 / 3 correct. Results saved.', { exact: true }).waitFor();
    assert.equal(await page.locator('#progress').textContent(), 'Trial 3 of 3');
    assert.equal(await page.locator('#result').textContent(), 'See report');
  });
});

test('native browser early, wrong, and omitted actions remain failures', { timeout: 15_000 }, async () => {
  await fixture(async ({ session, browser }) => {
    const page = await browser.newPage();
    await page.goto(session.url);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: `Start trial ${i + 1}`, exact: true }).click();
      if (i === 0) {
        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Red');
        const rect = await page.locator('#arena').boundingBox();
        await page.mouse.click(rect.x + 5, rect.y + 5);
      } else if (i === 1) {
        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
        const rect = await page.locator('#arena').boundingBox();
        await page.mouse.click(rect.x + 5, rect.y + 5);
      }
      if (i < 2) await page.getByRole('button', { name: 'Prepare next trial', exact: true }).click();
    }
    await page.getByText('0 / 3 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.deepEqual(report.trials.map(trial => trial.outcome), ['premature', 'wrong', 'expired']);
    assert.deepEqual(report.summary.failures, { premature: 1, wrong: 1, expired: 1 });
    assert.ok(report.trials.every(trial => trial.timing.reactionLatencyMs === null));
  }, { ...config, initialDelayMs: [500, 500] });
});

test('session protocol isolates participants and validates terminal evidence, retries and cancellation', { timeout: 10_000 }, async () => {
  await fixture(async ({ session, output }) => {
    const api = session.url.replace('/session/', '/api/session/');
    const clientId = 'protocol-client-0001';
    const post = async (action, data = {}, headers = {}) => fetch(`${api}/${action}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ clientId, ...data }) });
    let response = await post('connect', { display });
    let view = await response.json();
    const scenario = view.scenario;
    assert.equal((await post('connect', { clientId: 'different-client-0002', display })).status, 200); // Opening a preview does not claim the agent's browser.
    assert.equal((await post('start', { trialId: scenario.id }, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await fetch(`${api}/results.json`)).status, 409);
    assert.equal((await post('start', { trialId: 'wrong-trial' })).status, 409);
    assert.equal((await post('start', { trialId: scenario.id, display })).status, 200);
    assert.equal((await post('connect', { clientId: 'different-client-0002', display })).status, 409);
    assert.equal((await post('next')).status, 409);
    const events = [
      { trialId: scenario.id, type: 'prepared', atMs: 1, clock: 'browser-performance', phase: 'prepared' },
      { trialId: scenario.id, type: 'started', atMs: 2, clock: 'browser-performance', phase: 'waiting' },
      { trialId: scenario.id, type: 'activated', atMs: 2 + scenario.initialDelayMs, deadlineAtMs: 2 + scenario.initialDelayMs + scenario.responseWindowMs, clock: 'browser-performance', phase: 'active' },
      { trialId: scenario.id, type: 'action-registered', atMs: 3 + scenario.initialDelayMs, clock: 'browser-performance', phase: 'active', hit: true, inputTrusted: true, x: 200, y: 200 },
    ];
    const completion = { trialId: scenario.id, events, browserTimeOriginMs: 1000, display };
    assert.equal((await post('complete', { ...completion, events: events.slice(0, 3) })).status, 400);
    assert.equal((await post('complete', { ...completion, events: events.map(event => ({ ...event, trialId: 'other' })) })).status, 400);
    response = await post('complete', completion);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, 'between-trials');
    assert.equal((await post('complete', completion)).status, 200); // Lost-response retry is idempotent.
    assert.equal((await post('complete', { ...completion, browserTimeOriginMs: 2000 })).status, 409);
    assert.equal((await post('next')).status, 409);
    await sleep(550);
    response = await post('next');
    view = await response.json();
    assert.equal(view.state, 'ready');
    assert.equal(view.index, 2);
    assert.notEqual(view.scenario.id, scenario.id);
    assert.equal((await post('start', { trialId: scenario.id })).status, 409);
    assert.equal((await post('cancel')).status, 200);
    assert.equal((await post('start', { trialId: view.scenario.id })).status, 409);
    const report = await session.finished;
    assert.equal(report.status, 'cancelled');
    assert.equal(report.plannedTrials, 3);
    assert.equal(report.trials.length, 1);
    assert.equal(JSON.parse(await readFile(join(output, 'results.json'), 'utf8')).status, 'cancelled');
  });
});

test('offline oracle completes with screenshot capture disabled', { timeout: 10_000 }, async () => {
  const launch = chromium.launch.bind(chromium);
  const original = chromium.launch;
  chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const context = browser.newContext.bind(browser);
    browser.newContext = async (...values) => {
      const result = await context(...values);
      result.on('page', page => { page.screenshot = () => { throw new Error('Unexpected benchmark screenshot capture.'); }; });
      return result;
    };
    return browser;
  };
  try {
    const report = await runBenchmark({ config: { ...config, trialsPerLevel: 1 } });
    assert.equal(report.summary.correct, 1);
    assert.equal('observations' in report.trials[0], false);
  } finally { chromium.launch = original; }
});

test('session startup preserves existing exports', async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-existing-'));
  try {
    await writeFile(join(output, 'results.json'), 'existing-result');
    await assert.rejects(startBrowserSession({ outputDir: output }), /already exist/);
    assert.equal(await readFile(join(output, 'results.json'), 'utf8'), 'existing-result');
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('direct HTML opens explain local setup, and served practice enables Start only after initialization', { timeout: 10_000 }, async () => {
  await fixture(async ({ session, browser }) => {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(process.cwd(), 'web/index.html')).href);
    assert.equal(await page.locator('#startup-notice').isVisible(), true);
    assert.match(await page.locator('#startup-notice').textContent(), /npm run session/);
    assert.equal(await page.getByRole('button', { name: 'Start trial', exact: true }).isDisabled(), true);
    await page.goto(new URL('/', session.url).href);
    await page.waitForFunction(() => !document.querySelector('#start').disabled);
    assert.equal(await page.locator('#startup-notice').isVisible(), false);
    await page.getByRole('button', { name: 'Start trial', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Red');
  });
});
