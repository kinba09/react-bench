import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { startBrowserSession } from '../dist/session.js';
import { defaultConfig, createPlan, defaultDynamicTrackingConfig, targetAcquisitionConfig, defaultInhibitoryControlConfig } from '../dist/registry.js';
import { runBenchmark } from '../dist/runner.js';

const config = { ...defaultConfig, seed: 'browser-session-tests', levels: [1], trialsPerLevel: 3,
  initialDelayMs: [200, 200], responseWindowsMs: [1000, 1000, 1000, 1000, 1000] };
const display = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, userAgent: 'scripted-protocol-fixture' };

async function prepareNext(page) {
  await page.getByLabel('Pending tool actions have finished', { exact: true }).check();
  await page.getByRole('button', { name: 'Prepare next trial', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready'
    && !document.querySelector('#session-start').disabled);
}

async function fixture(fn, selected = config, agent) {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-session-'));
  const session = await startBrowserSession({ config: selected, outputDir: output, agent });
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
        await prepareNext(page);
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
      if (i < 2) await prepareNext(page);
    }
    await page.getByText('0 / 3 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.deepEqual(report.trials.map(trial => trial.outcome), ['premature', 'wrong', 'expired']);
    assert.deepEqual(report.summary.failures, { premature: 1, wrong: 1, expired: 1 });
    assert.ok(report.trials.every(trial => trial.timing.reactionLatencyMs === null));
  }, { ...config, initialDelayMs: [500, 500] });
});

const trackingConfig = { ...defaultDynamicTrackingConfig, seed: 'tracking-session-tests', trialsPerLevel: 1,
  initialDelayMs: [100, 180], clickWindowMs: 1200 };

async function clickMovingObject(page, required) {
  const point = await page.locator('#arena').evaluate((canvas, required) => {
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    const top = 68; // The reference star is above the moving field.
    const pixels = context.getImageData(0, top, canvas.width, canvas.height - top).data;
    const candidates = [];
    const target = { x: 0, y: 0, count: 0 };
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const gold = r === 229 && g === 168 && b === 46;
      const blue = !required && r === 100 && g === 127 && b === 152;
      if (!gold && !blue) continue;
      const x = (offset / 4) % canvas.width;
      const y = Math.floor(offset / 4 / canvas.width) + top;
      if (gold) {
        target.x += x;
        target.y += y;
        target.count++;
      } else {
        candidates.push({ x, y });
      }
    }
    if (!target.count) return null;
    const center = { x: target.x / target.count, y: target.y / target.count };
    const chosen = required ? center : candidates.find(point => Math.hypot(point.x - center.x, point.y - center.y) > 55);
    return chosen ? { x: rect.left + chosen.x, y: rect.top + chosen.y } : null;
  }, required);
  assert.ok(point, 'The rendered field has the requested moving object');
  await page.mouse.click(point.x, point.y);
}

async function waitForTrackingPhase(page, name) {
  await page.waitForFunction(phase => document.querySelector('#status').textContent.startsWith(phase), name);
}

test('Dynamic Tracking scores visible play and reacquisition at all five levels', { timeout: 30_000 }, async () => {
  await fixture(async ({ session, browser, output }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(session.url);
    const plan = createPlan(trackingConfig);
    const malformedTrial = plan.find(trial => trial.level === 4);
    let rejectedStatus;
    await page.route(`**/api/session/${session.id}/complete`, async route => {
      const completion = route.request().postDataJSON();
      if (completion.trialId !== malformedTrial.id || rejectedStatus !== undefined) return route.continue();
      const hidden = completion.events.find(event => event.type === 'phase-transition' && event.phase === 'hidden');
      hidden.phaseDeadlineAtMs += 1;
      const response = await route.fetch({ postData: completion });
      rejectedStatus = response.status();
      await route.fulfill({ response });
    });

    for (const [index, scenario] of plan.entries()) {
      await page.getByRole('button', { name: `Start trial ${index + 1}`, exact: true }).click();
      if (scenario.level >= 4) {
        await waitForTrackingPhase(page, 'Watch');
        await page.locator('#phase-countdown').waitFor({ state: 'visible' });
      }
      await waitForTrackingPhase(page, scenario.level >= 4 ? 'Click' : 'Moving');
      await clickMovingObject(page, true);
      if (scenario === malformedTrial) {
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        assert.equal(rejectedStatus, 400);
      }
      if (index < plan.length - 1) await prepareNext(page);
    }

    await page.getByText('5 / 5 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.equal(report.category, 'dynamic-tracking');
    assert.equal(report.environment.actionInterface, 'external-browser-tools');
    assert.equal(report.comparisonClass, 'visual');
    assert.deepEqual(report.summary.byLevel.map(level => level.objectsPerTrial), [1, 5, 15, 30, 60]);
    assert.deepEqual(report.trials.map(trial => trial.scenario), plan);
    for (const trial of report.trials) {
      const activation = trial.events.find(event => event.type === 'activated');
      const click = trial.events.at(-1);
      assert.equal(click.type, 'action-registered');
      assert.equal(click.clickedObjectId, trial.scenario.requiredTargetId);
      assert.equal(click.inputTrusted, true);
      assert.equal(trial.timing.reactionLatencyMs, click.atMs - activation.atMs);
      assert.equal(activation.deadlineAtMs, activation.atMs + trial.scenario.clickWindowMs);
      if (trial.scenario.level >= 4) {
        const [hidden, reappearance] = trial.events.filter(event => event.type === 'phase-transition');
        const start = trial.events.find(event => event.type === 'started');
        assert.equal(start.phase, 'watching');
        assert.equal(hidden.phase, 'hidden');
        assert.ok(hidden.atMs >= start.atMs + trial.scenario.watchDurationMs);
        assert.equal(hidden.phaseDeadlineAtMs, hidden.atMs + trial.scenario.hiddenDurationMs);
        assert.equal(reappearance.phase, 'active');
        assert.equal(reappearance.atMs, activation.atMs);
        assert.ok(activation.atMs >= hidden.phaseDeadlineAtMs);
      }
    }
    assert.deepEqual(JSON.parse(await readFile(join(output, 'results.json'), 'utf8')), report);
    const log = await readFile(join(output, 'trials.jsonl'), 'utf8');
    assert.deepEqual(log.trim().split('\n').map(line => JSON.parse(line)), report.trials);
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /Dynamic Tracking/);
    assert.match(html, /5 \/ 5/);
  }, trackingConfig);
});

test('Dynamic Tracking records premature clicks, distractor hits, and reappearance timeouts', { timeout: 30_000 }, async () => {
  const selected = { ...trackingConfig, levels: [4, 5], trialsPerLevel: 2 };
  const plan = createPlan(selected);
  const expected = { '4/1': 'watching', '5/1': 'hidden', '4/2': 'wrong', '5/2': 'expired' };
  await fixture(async ({ session, browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(session.url);
    for (const [index, scenario] of plan.entries()) {
      const action = expected[`${scenario.level}/${scenario.repetition}`];
      await page.getByRole('button', { name: `Start trial ${index + 1}`, exact: true }).click();
      if (action === 'watching' || action === 'hidden') {
        await waitForTrackingPhase(page, action === 'watching' ? 'Watch' : 'Hidden');
        const rect = await page.locator('#arena').boundingBox();
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      } else if (action === 'wrong') {
        await waitForTrackingPhase(page, 'Click');
        await clickMovingObject(page, false);
      }
      if (index < plan.length - 1) await prepareNext(page);
    }
    await page.getByText('0 / 4 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.deepEqual(report.summary.failures, { premature: 2, wrong: 1, expired: 1 });
    for (const trial of report.trials) {
      const { level, repetition } = trial.scenario;
      const action = expected[`${level}/${repetition}`];
      const terminal = trial.events.at(-1);
      const activation = trial.events.find(event => event.type === 'activated');
      assert.equal(trial.timing.reactionLatencyMs, null);
      if (action === 'watching' || action === 'hidden') {
        assert.equal(trial.outcome, 'premature');
        assert.equal(terminal.phase, action);
        assert.equal(terminal.clickedObjectId, null);
        assert.deepEqual(terminal.objects, []);
        assert.equal(activation, undefined);
      } else if (action === 'wrong') {
        assert.equal(trial.outcome, 'wrong');
        const clicked = terminal.objects.find(object => object.id === terminal.clickedObjectId);
        assert.equal(clicked?.role, 'distractor');
      } else {
        assert.equal(trial.outcome, 'expired');
        assert.equal(terminal.type, 'expired');
        assert.equal(terminal.deadlineAtMs, activation.atMs + trial.scenario.clickWindowMs);
        assert.ok(terminal.atMs >= terminal.deadlineAtMs);
      }
    }
  }, selected);
});

test('Target Acquisition sessions score seeded choices and export browser evidence', { timeout: 30_000 }, async () => {
  const acquisition = { ...targetAcquisitionConfig, seed: 'acquisition-session', levels: [1, 2, 4, 5],
    trialsPerLevel: 1, initialDelayMs: [600, 900] };
  const plan = createPlan(acquisition);
  await fixture(async ({ session, browser, output }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(session.url);
    const arena = page.locator('#arena');
    for (const [index, scenario] of plan.entries()) {
      const start = page.getByRole('button', { name: `Start trial ${index + 1}`, exact: true });
      await page.getByRole('img', { name: `Reference shape: ${scenario.reference.symbol}`, exact: true }).waitFor();
      const matching = scenario.objects.find(object => object.matching);
      const distractor = scenario.objects.find(object => !object.matching);
      const clickObject = async object => {
        const rect = await arena.boundingBox();
        await page.mouse.click(rect.x + rect.width * object.u, rect.y + rect.height * object.v);
      };
      if (index === 0) {
        const alpha = () => arena.evaluate((canvas, { u, v }) =>
          canvas.getContext('2d').getImageData(Math.floor(canvas.width * u), Math.floor(canvas.height * v), 1, 1).data[3], matching);
        assert.equal(await alpha(), 0);
        await start.click();
        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Find the match');
        assert.equal(await alpha(), 255);
        const oldScroll = await page.evaluate(() => scrollY);
        // Exercise a viewport move after activation, when the board has already been drawn.
        await page.evaluate(() => scrollTo(0, scrollY > 0 ? 0 : 100));
        await page.waitForFunction(previous => scrollY !== previous, oldScroll);
        await clickObject(matching);
      } else {
        await start.click();
        if (index === 1) {
          await page.waitForFunction(() => document.querySelector('#status').textContent === 'Find the match');
          await clickObject(distractor);
          await clickObject(matching);
        } else if (index === 3) {
          await page.waitForFunction(() => document.querySelector('#status').textContent === 'Get ready');
          await clickObject(matching);
        }
      }
      if (index < plan.length - 1) await prepareNext(page);
    }
    await page.getByText('1 / 4 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.equal(report.category, 'target-acquisition');
    assert.equal(report.comparisonClass, 'visual');
    assert.deepEqual(report.trials.map(trial => trial.scenario), plan);
    assert.deepEqual(report.trials.map(trial => trial.outcome), ['success', 'wrong', 'expired', 'premature']);
    assert.deepEqual(report.summary.byLevel.map(level => level.objectsPerTrial), [6, 16, 64, 100]);
    for (const trial of report.trials.slice(0, 3)) {
      const activation = trial.events.find(event => event.type === 'activated');
      const started = trial.events.find(event => event.type === 'started');
      assert.ok(activation.atMs >= started.atMs + trial.scenario.initialDelayMs);
      assert.equal(activation.deadlineAtMs, activation.atMs + 10_000);
    }
    const [success, wrong, expired, premature] = report.trials;
    for (const trial of [success, wrong]) {
      const clicks = trial.events.filter(event => event.type === 'action-registered');
      assert.equal(clicks.length, 1);
      assert.equal(clicks[0].inputTrusted, true);
      assert.equal(trial.scenario.objects[clicks[0].objectIndex].matching, trial === success);
    }
    const activation = success.events.find(event => event.type === 'activated');
    const click = success.events.find(event => event.type === 'action-registered');
    assert.equal(success.timing.reactionLatencyMs, click.atMs - activation.atMs);
    assert.ok(expired.events.at(-1).atMs >= expired.events.at(-1).deadlineAtMs);
    assert.ok(!expired.events.some(event => event.type === 'action-registered'));
    assert.ok(!premature.events.some(event => event.type === 'activated'));
    assert.deepEqual(JSON.parse(await readFile(join(output, 'results.json'), 'utf8')), report);
    const rows = (await readFile(join(output, 'trials.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(rows, report.trials);
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /Target Acquisition/);
    assert.match(html, /<th>Objects<\/th>/);
    assert.match(html, /1 \/ 4/);
    await page.reload();
    await page.getByText('1 / 4 correct. Results saved.', { exact: true }).waitFor();
    assert.equal(await page.locator('#category-title').textContent(), 'Target Acquisition');
    assert.equal(await page.locator('#window').textContent(), '10 s');
  }, acquisition);
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
    assert.equal((await post('next')).status, 409); // Quiescence needs explicit acknowledgement.
    response = await post('next', { actionsSettled: true });
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

const inhibitorySessionConfig = { ...defaultInhibitoryControlConfig, seed: 'inhibitory-session-all-levels',
  trialsPerLevel: 1, initialDelayMs: [100, 100], responseWindowsMs: [450, 500, 650, 800, 1000] };

async function clickSeededTarget(page, scenario) {
  const rect = await page.locator('#arena').boundingBox();
  await page.mouse.click(rect.x + rect.width * scenario.target.u, rect.y + rect.height * scenario.target.v);
}

test('Inhibitory Control completes every condition and level with declared agent setup and exports', { timeout: 40_000 }, async () => {
  const agent = { name: 'scripted-browser-participant', model: null, access: 'visual',
    client: 'Playwright test client 1.60.0', tool: 'Chromium native mouse 1.60.0',
    contextPolicy: 'One scripted participant per run; pending input awaited before each preparation.' };
  await fixture(async ({ session, browser, output }) => {
    const page = await browser.newPage({ viewport: display.viewport });
    page.screenshot = () => { throw new Error('Unexpected ReactBench screenshot.'); };
    await page.goto(session.url);
    assert.equal(await page.evaluate(() => typeof window.reactBenchEnvironment), 'undefined');
    const plan = createPlan(inhibitorySessionConfig);
    for (const [index, scenario] of plan.entries()) {
      await page.getByRole('button', { name: `Start trial ${index + 1}`, exact: true }).click();
      if (scenario.condition === 'go') {
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Go ·'));
        await clickSeededTarget(page, scenario);
      }
      if (index < plan.length - 1) await prepareNext(page);
    }
    await page.getByText('15 / 15 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.equal(report.comparisonClass, 'visual');
    assert.deepEqual(report.agent, agent);
    assert.deepEqual(report.trials.map(trial => trial.scenario), plan);
    assert.deepEqual(report.summary.inhibitoryControl.byCondition.map(row => [row.condition, row.total, row.correct]),
      [['go', 5, 5], ['no-go', 5, 5], ['delayed-stop', 5, 5]]);
    for (const trial of report.trials) {
      const activation = trial.events.find(event => event.type === 'activated');
      const stop = trial.events.find(event => event.type === 'stop-signal');
      const terminal = trial.events.at(-1);
      if (trial.scenario.condition === 'go') {
        assert.equal(trial.conditionOutcome, 'go-response');
        assert.equal(trial.timing.reactionLatencyMs, terminal.atMs - activation.atMs);
        assert.equal(terminal.inputTrusted, true);
      } else {
        assert.equal(trial.timing.reactionLatencyMs, null);
        assert.equal(terminal.type, 'expired');
        assert.ok(terminal.atMs >= activation.deadlineAtMs);
      }
      if (trial.scenario.condition === 'delayed-stop') {
        assert.equal(activation.plannedStopAtMs, activation.atMs + trial.scenario.plannedStopDelayMs);
        assert.ok(stop.atMs >= activation.plannedStopAtMs && stop.atMs < activation.deadlineAtMs);
      } else assert.equal(stop, undefined);
    }
    assert.deepEqual(JSON.parse(await readFile(join(output, 'results.json'), 'utf8')), report);
    assert.deepEqual((await readFile(join(output, 'trials.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse), report.trials);
    const html = await readFile(join(output, 'report.html'), 'utf8');
    assert.match(html, /Playwright test client 1.60.0/);
    assert.match(html, /One scripted participant per run/);
    assert.match(html, /Browser identity \(self-reported\)/);
    assert.match(html, /Delayed-stop withholding: 5/);
    await page.reload();
    await page.getByText('15 / 15 correct. Results saved.', { exact: true }).waitFor();
    assert.equal(await page.locator('#category-title').textContent(), 'Inhibitory Control');
  }, inhibitorySessionConfig, agent);
});

test('Inhibitory Control preserves click failures and retries malformed stop evidence', { timeout: 30_000 }, async () => {
  const selected = { ...inhibitorySessionConfig, seed: 'inhibitory-session-failures', levels: [4], trialsPerLevel: 3,
    initialDelayMs: [300, 300], responseWindowsMs: [1000, 1000, 1000, 1000, 1000] };
  await fixture(async ({ session, browser }) => {
    const page = await browser.newPage();
    let rejectedStatus;
    await page.route(`**/api/session/${session.id}/complete`, async route => {
      const body = route.request().postDataJSON();
      const stop = body.events.find(event => event.type === 'stop-signal');
      if (!stop || rejectedStatus !== undefined) return route.continue();
      stop.atMs = body.events.find(event => event.type === 'activated').atMs;
      const response = await route.fetch({ postData: body });
      rejectedStatus = response.status();
      await route.fulfill({ response });
    });
    await page.goto(session.url);
    const plan = createPlan(selected);
    const expected = new Map();
    for (const [index, scenario] of plan.entries()) {
      let outcome;
      await page.getByRole('button', { name: `Start trial ${index + 1}`, exact: true }).click();
      if (scenario.condition === 'go') {
        if (scenario.repetition === 1) {
          await clickSeededTarget(page, scenario);
          outcome = 'go-premature-click';
        } else if (scenario.repetition === 2) {
          await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Go ·'));
          const rect = await page.locator('#arena').boundingBox();
          await page.mouse.click(rect.x + 5, rect.y + 5);
          outcome = 'go-wrong-click';
        } else outcome = 'go-omission';
      } else if (scenario.condition === 'no-go') {
        if (scenario.repetition === 1) {
          await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('No-go ·'));
          await clickSeededTarget(page, scenario);
          outcome = 'forbidden-click';
        } else outcome = 'withheld';
      } else if (scenario.repetition === 1) {
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Go ·'));
        await clickSeededTarget(page, scenario);
        outcome = 'pre-stop-click';
      } else if (scenario.repetition === 2) {
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Stop ·'));
        await clickSeededTarget(page, scenario);
        outcome = 'post-stop-click';
      } else outcome = 'stop-withheld';
      expected.set(scenario.id, outcome);
      await page.waitForFunction(() => !document.querySelector('#session-retry').hidden
        || !document.querySelector('#session-next').hidden || !document.querySelector('#session-downloads').hidden);
      if (await page.getByRole('button', { name: 'Retry', exact: true }).isVisible()) {
        assert.equal(rejectedStatus, 400);
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
      }
      if (index < plan.length - 1) await prepareNext(page);
    }
    const report = await session.finished;
    assert.equal(rejectedStatus, 400);
    for (const trial of report.trials) {
      assert.equal(trial.conditionOutcome, expected.get(trial.id));
      assert.equal(trial.timing.reactionLatencyMs, null);
      if (trial.conditionOutcome === 'pre-stop-click') assert.ok(!trial.events.some(event => event.type === 'stop-signal'));
    }
    assert.equal(report.summary.correct, 3);
    assert.deepEqual(report.summary.failures, { premature: 1, wrong: 4, expired: 1 });
  }, selected);
});

test('pending native input cannot score between trials, during readiness, or across a preparation gesture', { timeout: 15_000 }, async () => {
  const selected = { ...config, trialsPerLevel: 2, responseWindowsMs: [600, 600, 600, 600, 600] };
  await fixture(async ({ session, browser }) => {
    const page = await browser.newPage();
    await page.goto(session.url);
    const plan = createPlan(selected);
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
    await clickSeededTarget(page, plan[0]);
    await page.getByText('Trial 1 recorded.', { exact: false }).waitFor();
    const rect = await page.locator('#arena').boundingBox();
    await page.mouse.click(rect.x + 5, rect.y + 5); // Pending click into completed field.
    await sleep(600);
    assert.equal(await page.getByRole('button', { name: 'Prepare next trial', exact: true }).isDisabled(), true);
    await prepareNext(page);
    await page.mouse.click(rect.x + 5, rect.y + 5); // Pending click into prepared field.
    assert.equal(await page.locator('#status').textContent(), 'Ready');
    // A press in readiness may be released after another input mechanism starts the trial.
    const target = plan[1].target;
    await page.mouse.move(rect.x + rect.width * target.u, rect.y + rect.height * target.v);
    await page.mouse.down();
    await page.getByRole('button', { name: 'Start trial 2', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
    await page.mouse.up();
    await page.getByText('1 / 2 correct. Results saved.', { exact: true }).waitFor();
    const report = await session.finished;
    assert.deepEqual(report.trials.map(trial => trial.outcome), ['success', 'expired']);
    assert.ok(!report.trials[1].events.some(event => event.type === 'action-registered'));
  }, selected);
});

test('cancelling an active Inhibitory Control session stops input and exports no unfinished score', { timeout: 10_000 }, async () => {
  await fixture(async ({ session, browser, output }) => {
    const page = await browser.newPage();
    await page.goto(session.url);
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Go ·'));
    await page.getByRole('button', { name: 'Cancel session', exact: true }).click();
    await page.getByText('Session cancelled. Partial results saved; unfinished trials are not scored.', { exact: true }).waitFor();
    await clickSeededTarget(page, createPlan({ ...inhibitorySessionConfig, levels: [4], conditions: ['delayed-stop'] })[0]);
    const report = await session.finished;
    assert.equal(report.status, 'cancelled');
    assert.equal(report.trials.length, 0);
    assert.deepEqual(report, JSON.parse(await readFile(join(output, 'results.json'), 'utf8')));
    await page.reload();
    await page.getByText('Session cancelled. Partial results saved; unfinished trials are not scored.', { exact: true }).waitFor();
  }, { ...inhibitorySessionConfig, levels: [4], conditions: ['delayed-stop'] });
});


test('session CLI records seed override and complete external-agent setup without opening a browser', { timeout: 15_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'reactbench-session-cli-'));
  const child = spawn(process.execPath, ['dist/cli.js', 'session', '--no-open', '--port', '0',
    '--config', 'configs/inhibitory-control.json', '--seed', 'cli-seed-override', '--output', output,
    '--agent', 'existing-agent', '--model', 'declared-model', '--client', 'existing-client 2.0',
    '--tool', 'native-browser 3.0', '--context-policy', 'Fresh session; same context across trials; await all tool calls.']);
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  let text = '';
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CLI startup timed out: ${stderr}`)), 10_000);
      child.stdout.on('data', data => {
        text += data;
        if (/ReactBench scored browser session: http:\/\/127\.0\.0\.1:\d+\/session\//.test(text)) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`CLI exited ${code}: ${stderr}`)); });
    });
    assert.match(text, /1 repetitions per condition per level/);
    child.kill('SIGINT');
    assert.deepEqual(await closed, { code: 0, signal: null });
    const report = JSON.parse(await readFile(join(output, 'results.json'), 'utf8'));
    assert.equal(report.config.seed, 'cli-seed-override');
    assert.equal(report.status, 'cancelled');
    assert.equal(report.plannedTrials, 15);
    assert.deepEqual(report.agent, { name: 'existing-agent', model: 'declared-model', access: 'visual',
      client: 'existing-client 2.0', tool: 'native-browser 3.0',
      contextPolicy: 'Fresh session; same context across trials; await all tool calls.' });
    assert.equal(report.environment.viewport, null);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
    await closed;
    await rm(output, { recursive: true, force: true });
  }
});
