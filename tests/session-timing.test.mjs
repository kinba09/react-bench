import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startBrowserSession } from '../dist/session.js';
import { createPlan, defaultConfig, defaultDynamicTrackingConfig, defaultInhibitoryControlConfig } from '../dist/registry.js';
import { grade } from '../dist/grader.js';

const agent = { name: 'delayed-native-input-fixture', model: null, access: 'visual',
  client: 'Playwright scripted participant 1.60.0', tool: 'Chromium mouse and visible-page reads',
  contextPolicy: 'One browser context per run; await pending tool calls before acknowledging next-trial readiness.' };
const timingConfig = { ...defaultConfig, seed: 'native-session-timing', levels: [1], trialsPerLevel: 4,
  initialDelayMs: [100, 100], responseWindowsMs: [1200, 1200, 1200, 1200, 1200] };

async function fixture(config, profile, run) {
  const outputDir = await mkdtemp(join(tmpdir(), 'reactbench-native-timing-'));
  const session = await startBrowserSession({ config, outputDir, agent });
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    page.screenshot = () => { throw new Error('This path must not capture benchmark screenshots.'); };
    await page.goto(session.url);
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).waitFor();
    await run({ session, page, outputDir });
  } finally {
    await browser?.close();
    await session.close();
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function prepareNext(page) {
  await page.getByLabel('Pending tool actions have finished', { exact: true }).check();
  await page.getByRole('button', { name: 'Prepare next trial', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready'
    && !document.querySelector('#session-start').disabled);
}

// Test fixtures may use seeded geometry to schedule known inputs. They are not visual-model competitors.
async function targetPoint(page, scenario) {
  const rect = await page.locator('#arena').boundingBox();
  return { x: rect.x + rect.width * scenario.target.u, y: rect.y + rect.height * scenario.target.v };
}
async function readVisibleStatus(page) {
  return page.evaluate(() => ({ text: document.querySelector('#status').textContent,
    atMs: performance.now(), timeOriginMs: performance.timeOrigin }));
}
async function exportsFrom(session) {
  const api = session.url.replace('/session/', '/api/session/');
  const files = {};
  for (const file of ['results.json', 'trials.jsonl', 'report.html']) {
    const response = await fetch(`${api}/${file}`);
    assert.equal(response.status, 200);
    files[file] = await response.text();
  }
  return files;
}
function verifyTiming(trial) {
  const [prepared, started] = trial.events;
  const activated = trial.events.find(event => event.type === 'activated');
  const click = trial.events.find(event => event.type === 'action-registered');
  assert.equal(trial.timing.preparationMs, started.atMs - prepared.atMs);
  assert.equal(trial.timing.preparationClock, 'browser-performance');
  assert.equal(trial.timing.reactionClock, 'browser-performance');
  assert.ok(trial.events.every(event => event.clock === 'browser-performance' && event.trialId === trial.id));
  assert.equal(trial.timing.modelProcessingMs, null);
  assert.deepEqual(trial.actions, []);
  assert.equal('observations' in trial, false);
  assert.equal('measuredCaptureHz' in trial.timing, false);
  assert.deepEqual(grade(trial.events, trial.scenario), { outcome: trial.outcome, reactionLatencyMs: trial.timing.reactionLatencyMs });
  if (trial.outcome === 'success') {
    assert.equal(trial.timing.reactionLatencyMs, click.atMs - activated.atMs);
    assert.equal(click.inputTrusted, true);
  } else assert.equal(trial.timing.reactionLatencyMs, null);
  if (trial.outcome === 'expired') {
    const expiry = trial.events.at(-1);
    assert.equal(expiry.type, 'expired');
    assert.ok(expiry.atMs >= activated.deadlineAtMs);
    assert.equal(expiry.deadlineAtMs, activated.deadlineAtMs);
    assert.equal(click, undefined);
  }
}

const profiles = [
  { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
];
for (const profile of profiles) {
  test(`slow native participants cannot extend deadlines at ${profile.viewport.width}px / scale ${profile.deviceScaleFactor}`, { timeout: 30_000 }, async () => {
    await fixture(timingConfig, profile, async ({ session, page, outputDir }) => {
      const plan = createPlan(timingConfig);
      const observations = [];
      for (let index = 0; index < plan.length; index++) {
        const scenario = plan[index];
        await sleep(200); // Untimed preparation must not consume a response window.
        assert.equal((await readVisibleStatus(page)).text, 'Ready');
        await page.getByRole('button', { name: `Start trial ${index + 1}`, exact: true }).click();
        if (index === 0) {
          await sleep(300); // Participant-owned observation delay.
          observations[index] = await readVisibleStatus(page);
          assert.equal(observations[index].text, 'Green');
          await sleep(150); // Participant-owned decision delay.
          const point = await targetPoint(page, scenario);
          await sleep(100); // Participant-owned dispatch delay.
          await page.mouse.click(point.x, point.y);
        } else if (index === 1) {
          await sleep(1900); // The game must finish before this observation happens.
          observations[index] = await readVisibleStatus(page);
          assert.equal(observations[index].text, 'Complete');
          const point = await targetPoint(page, scenario);
          await page.mouse.click(point.x, point.y); // A stale decision cannot rescue the deadline.
        } else {
          await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
          observations[index] = await readVisibleStatus(page);
          const point = await targetPoint(page, scenario);
          if (index === 2) {
            await sleep(1600); // Reasoning finishes after the visible cue's response window.
            await page.mouse.click(point.x, point.y);
          } else {
            // The browser must expire even while a native tool call is still in flight.
            const pendingInput = page.mouse.click(point.x, point.y, { delay: 1600 });
            try {
              await page.getByText('1 / 4 correct. Results saved.', { exact: true }).waitFor();
              await pendingInput;
            } finally { await pendingInput.catch(() => {}); }
          }
        }
        if (index < plan.length - 1) {
          await page.getByText(`Trial ${index + 1} recorded.`, { exact: false }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Prepare next trial', exact: true }).isDisabled(), true);
          await prepareNext(page); // All earlier native inputs have returned before acknowledgement.
        }
      }
      const report = await session.finished;
      assert.deepEqual(report.trials.map(trial => trial.scenario), plan);
      assert.deepEqual(report.trials.map(trial => trial.outcome), ['success', 'expired', 'expired', 'expired']);
      assert.deepEqual(report.agent, agent);
      assert.equal(report.comparisonClass, 'visual');
      assert.equal(report.environment.actionInterface, 'external-browser-tools');
      assert.deepEqual(report.environment.viewport, profile.viewport);
      assert.equal(report.environment.deviceScaleFactor, profile.deviceScaleFactor);
      for (const [index, trial] of report.trials.entries()) {
        verifyTiming(trial);
        assert.deepEqual(trial.display.viewport, profile.viewport);
        assert.equal(trial.display.deviceScaleFactor, profile.deviceScaleFactor);
        assert.ok(trial.timing.preparationMs >= 200);
        assert.equal(trial.timing.browserTimeOriginMs, observations[index].timeOriginMs);
        const activation = trial.events.find(event => event.type === 'activated');
        assert.equal(activation.deadlineAtMs - activation.atMs, trial.scenario.responseWindowMs);
      }
      assert.ok(report.trials[1].events.at(-1).atMs <= observations[1].atMs);
      const files = await exportsFrom(session);
      assert.deepEqual(JSON.parse(files['results.json']), report);
      assert.deepEqual(files['trials.jsonl'].trim().split('\n').map(line => JSON.parse(line)), report.trials);
      assert.match(files['report.html'], /1 \/ 4/);
      assert.match(files['report.html'], /Unavailable/);
      for (const [file, content] of Object.entries(files)) {
        const saved = await readFile(join(outputDir, file), 'utf8');
        if (file === 'results.json') assert.deepEqual(JSON.parse(saved), JSON.parse(content));
        else assert.equal(saved, content);
      }
      // Further delayed input cannot mutate completed exports or start another trial.
      const point = await targetPoint(page, plan.at(-1));
      await page.mouse.click(point.x, point.y);
      assert.deepEqual(await exportsFrom(session), files);
    });
  });
}
async function observeMovingStar(page) {
  return page.locator('#arena').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const top = Math.ceil(68 * scale); // Exclude the visible reference icon.
    const pixels = canvas.getContext('2d').getImageData(0, top, canvas.width, canvas.height - top).data;
    let x = 0;
    let y = 0;
    let count = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] !== 229 || pixels[offset + 1] !== 168 || pixels[offset + 2] !== 46) continue;
      x += (offset / 4) % canvas.width;
      y += Math.floor(offset / 4 / canvas.width) + top;
      count++;
    }
    return count ? { x: rect.left + x / count / scale, y: rect.top + y / count / scale,
      atMs: performance.now(), timeOriginMs: performance.timeOrigin } : null;
  });
}

test('a delayed native click uses the moving field at registration, not stale observed coordinates', { timeout: 10_000 }, async () => {
  const config = { ...defaultDynamicTrackingConfig, seed: 'native-stale-target', levels: [1], trialsPerLevel: 1,
    initialDelayMs: [100, 100], clickWindowMs: 1800 };
  await fixture(config, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, async ({ session, page }) => {
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Moving'));
    // A single pixel read belongs to the scripted participant; there is no benchmark image sampler.
    const observed = await observeMovingStar(page);
    assert.ok(observed);
    await sleep(600);
    await page.mouse.click(observed.x, observed.y);
    const report = await session.finished;
    const trial = report.trials[0];
    assert.equal(trial.outcome, 'wrong');
    verifyTiming(trial);
    const click = trial.events.find(event => event.type === 'action-registered');
    const target = click.objects.find(object => object.id === click.requiredTargetId);
    assert.ok(click.atMs - observed.atMs >= 600);
    assert.ok(Math.hypot(target.x - observed.x, target.y - observed.y) > target.radius);
    assert.equal(click.inputTrusted, true);
    assert.equal(click.hit, false);
    assert.equal(trial.timing.browserTimeOriginMs, observed.timeOriginMs);
    const files = await exportsFrom(session);
    assert.deepEqual(JSON.parse(files['results.json']).trials[0], trial);
  });
});

test('cancelled sessions reject pending input and preserve finished evidence byte for byte', { timeout: 15_000 }, async () => {
  const config = { ...timingConfig, trialsPerLevel: 2 };
  await fixture(config, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, async ({ session, page }) => {
    let completion;
    let latestStart;
    page.on('request', request => {
      if (request.url().endsWith('/complete') && !completion) completion = request.postDataJSON();
      if (request.url().endsWith('/start')) latestStart = request.postDataJSON();
    });
    const plan = createPlan(config);
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
    let point = await targetPoint(page, plan[0]);
    await page.mouse.click(point.x, point.y);
    await prepareNext(page);
    await page.getByRole('button', { name: 'Start trial 2', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Green');
    point = await targetPoint(page, plan[1]);
    // This external call has no cancellation primitive; drain it after cancelling the game.
    const pendingInput = sleep(800).then(() => page.mouse.click(point.x, point.y));
    try {
      await page.getByRole('button', { name: 'Cancel session', exact: true }).click();
      const report = await session.finished;
      assert.equal(report.status, 'cancelled');
      assert.equal(report.trials.length, 1);
      assert.equal(report.trials[0].outcome, 'success');
      const before = await exportsFrom(session);
      await pendingInput;
      assert.deepEqual(await exportsFrom(session), before);
      const api = session.url.replace('/session/', '/api/session/');
      const post = (action, data) => page.request.post(`${api}/${action}`, { data });
      // Retrying the same completed evidence is safe even after cancellation.
      const retry = await post('complete', completion);
      assert.equal(retry.status(), 200);
      assert.equal((await retry.json()).state, 'cancelled');
      assert.equal((await post('complete', { ...completion, browserTimeOriginMs: completion.browserTimeOriginMs + 1 })).status(), 409);
      assert.equal((await post('complete', { ...latestStart, events: [] })).status(), 409);
      assert.equal((await post('start', latestStart)).status(), 409);
      assert.equal((await post('next', { clientId: latestStart.clientId, actionsSettled: true })).status(), 409);
      assert.deepEqual(await exportsFrom(session), before);
    } finally { await pendingInput.catch(() => {}); }
  });
});

for (const config of [
  { ...timingConfig, trialsPerLevel: 1 },
  { ...defaultInhibitoryControlConfig, seed: 'native-scrolled-go', levels: [1], conditions: ['go'], trialsPerLevel: 1,
    initialDelayMs: [100, 100], responseWindowsMs: [1200, 1200, 1200, 1200, 1200] },
]) {
  test(`${config.category} hit testing follows scrolling between observation and input`, { timeout: 10_000 }, async () => {
    await fixture(config, { viewport: { width: 1280, height: 500 }, deviceScaleFactor: 1 }, async ({ session, page }) => {
      await page.getByRole('button', { name: 'Start trial 1', exact: true }).click();
      await page.waitForFunction(() => /^(Green|Go ·)/.test(document.querySelector('#status').textContent));
      const before = await page.evaluate(() => scrollY);
      assert.ok(before > 0, 'Start is below the fold in this display profile');
      await page.mouse.wheel(0, -10000);
      await page.waitForFunction(previous => scrollY !== previous, before);
      const point = await targetPoint(page, createPlan(config)[0]);
      await page.mouse.click(point.x, point.y);
      const report = await session.finished;
      assert.equal(report.trials[0].outcome, 'success');
      const click = report.trials[0].events.find(event => event.type === 'action-registered');
      assert.equal(click.inputTrusted, true);
      assert.equal(click.hit, true);
    });
  });
}
