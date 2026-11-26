import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startBrowserSession } from '../dist/session.js';
import { defaultConfig } from '../dist/registry.js';

test('session controls stay locked while an inter-trial transition awaits the server', { timeout: 15_000 }, async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'reactbench-handoff-'));
  const session = await startBrowserSession({ outputDir, config: { ...defaultConfig,
    levels: [1], trialsPerLevel: 2, initialDelayMs: [100, 100], responseWindowsMs: [400, 400, 400, 400, 400] } });
  const browser = await chromium.launch();
  let releaseNext;
  const nextGate = new Promise(resolve => { releaseNext = resolve; });
  let sawNext;
  const nextRequested = new Promise(resolve => { sawNext = resolve; });
  try {
    const page = await browser.newPage();
    await page.route(`**/api/session/${session.id}/next`, async route => {
      sawNext();
      await nextGate;
      await route.continue();
    });
    await page.goto(session.url);
    await page.getByRole('button', { name: 'Start trial 1', exact: true }).click();
    await page.getByLabel('Pending tool actions have finished', { exact: true }).check();
    await page.getByRole('button', { name: 'Prepare next trial', exact: true }).click();
    await nextRequested;
    assert.equal(await page.getByLabel('Pending tool actions have finished', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Prepare next trial', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Cancel session', exact: true }).isDisabled(), true);
    releaseNext();
    await page.getByRole('button', { name: 'Start trial 2', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#session-start').disabled);
    assert.equal(await page.locator('#status').textContent(), 'Ready');
    await page.getByRole('button', { name: 'Cancel session', exact: true }).click();
    const report = await session.finished;
    assert.equal(report.status, 'cancelled');
    assert.equal(report.trials.length, 1);
  } finally {
    releaseNext();
    await browser.close();
    await session.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});
