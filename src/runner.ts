import { randomUUID } from 'node:crypto';
import { cpus, platform, arch, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { OracleAdapter } from './adapters/oracle.js';
import { grade } from './grader.js';
import { ObservationSampler } from './observations.js';
import { createPlan, defaultConfig, dynamicTrackingSpeedPxPerSecond, dynamicTrackingTargetRadiusPx, taskRegistry, validateConfig } from './registry.js';
import { summarize, writeReport } from './reporter.js';
import { startServer } from './server.js';
import { benchmarkProvenance } from './provenance.js';
import type { ActionRecord, AgentAdapter, BenchmarkConfig, OracleContext, PrivilegedAdapter, RunReport, Scenario, TrialResult, VisualContext } from './types.js';

function hasOracleAccess(adapter: AgentAdapter): adapter is PrivilegedAdapter {
  return adapter.metadata.access === 'privileged-oracle';
}

export interface RunOptions {
  config?: BenchmarkConfig;
  outputDir?: string;
  headed?: boolean;
  adapterFactory?: () => AgentAdapter;
}

async function runTrial(browser: Browser, url: string, scenario: Scenario, index: number, total: number,
  adapter: AgentAdapter, hz: number): Promise<TrialResult> {
  const preparationStart = performance.now();
  const browserContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
    reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light' });
  const controller = new AbortController();
  let sampler: ObservationSampler | undefined;
  try {
    const page: Page = await browserContext.newPage();
    await page.goto(`${url}/?controlled=1&access=${adapter.metadata.access}`);
    await page.waitForFunction(() => Boolean(window.reactBenchEnvironment));
    await page.evaluate(({ scenario, index, total }) => window.reactBenchEnvironment.prepare(scenario, index, total), { scenario, index, total });
    const browserTimeOriginMs = await page.evaluate(() => performance.timeOrigin);
    sampler = new ObservationSampler(page, scenario.id, hz);
    await sampler.start();
    const observations = sampler;
    const actions: ActionRecord[] = [];
    let started = false;
    let attempted = false;
    const context: VisualContext = {
      trialId: scenario.id, instructions: taskRegistry[scenario.category].instructions, signal: controller.signal,
      observe: () => controller.signal.aborted ? null : observations.observe(),
      input: {
        async click(x, y, observationId) {
          if (controller.signal.aborted || attempted) return;
          if (!started) throw new Error('Input is unavailable during preparation.');
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1280 || y >= 720) throw new Error('Click coordinates must be finite viewport CSS pixels.');
          if (observationId !== undefined && !observations.records.some(frame => frame.id === observationId)) throw new Error('Unknown observation identity.');
          attempted = true;
          const action: ActionRecord = { id: `${scenario.id}/action-1`, type: 'click', x, y,
            observationId: observationId ?? null, submittedAtMs: performance.now(), decisionCompletedAtMs: null,
            dispatchedAtMs: performance.now(), returnedAtMs: null, clock: 'runner-performance' };
          actions.push(action);
          try { await page.mouse.click(x, y); } finally { action.returnedAtMs = performance.now(); }
        },
      },
    };
    const oracleContext: OracleContext = { ...context, oracle: {
      snapshot: () => page.evaluate(() => window.reactBenchEnvironment.snapshot()),
    } };
    const prepare = hasOracleAccess(adapter)
      ? adapter.prepare(oracleContext) : adapter.prepare(context);
    await Promise.race([prepare, sleep(30_000, undefined, { ref: false }).then(() => { throw new Error('Adapter preparation timed out.'); }), observations.failure]);
    const preparationMs = performance.now() - preparationStart;
    started = true;
    await page.evaluate(() => window.reactBenchEnvironment.start());
    const task = hasOracleAccess(adapter) ? adapter.run(oracleContext) : adapter.run(context);
    let failAdapter!: (error: unknown) => void;
    const failure = new Promise<never>((_resolve, reject) => { failAdapter = reject; });
    const settledTask = task.catch(error => { if (!controller.signal.aborted) failAdapter(error); });
    try {
      await Promise.race([
        page.waitForFunction(() => window.reactBenchEnvironment.snapshot().phase === 'complete', undefined,
          { timeout: (scenario.category === 'dynamic-tracking'
            ? scenario.watchDurationMs + scenario.hiddenDurationMs + (scenario.level < 4 ? scenario.initialDelayMs : 0) + scenario.clickWindowMs
            : scenario.initialDelayMs + scenario.responseWindowMs) + 10_000 }),
        failure, observations.failure,
      ]);
    } finally {
      controller.abort();
    }
    await Promise.race([settledTask, sleep(500, undefined, { ref: false })]);
    await observations.stop();
    const snapshot = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
    const first = observations.records[0];
    const last = observations.records.at(-1);
    const measuredCaptureHz = first && last && first !== last
      ? (observations.records.length - 1) * 1000 / (last.requestedAtMs - first.requestedAtMs) : null;
    const graded = grade(snapshot.events);
    return { id: scenario.id, scenario, outcome: graded.outcome, events: snapshot.events,
      actions, observations: observations.records,
      timing: { preparationMs, reactionLatencyMs: graded.reactionLatencyMs, modelProcessingMs: null,
        measuredCaptureHz, browserTimeOriginMs, runnerClock: 'runner-performance', reactionClock: 'browser-performance',
        measurement: 'software-activation-to-input-handler' },
    };
  } finally {
    controller.abort();
    try { await sampler?.stop(); } finally { await browserContext.close(); }
  }
}

export async function runBenchmark(options: RunOptions = {}): Promise<RunReport> {
  const config = validateConfig(options.config ?? defaultConfig);
  const plan = createPlan(config);
  const adapterFactory = options.adapterFactory ?? (() => new OracleAdapter());
  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: !options.headed });
    const trials: TrialResult[] = [];
    let agent: AgentAdapter['metadata'] | undefined;
    for (const [index, scenario] of plan.entries()) {
      const adapter = adapterFactory();
      if (!['visual', 'privileged-oracle'].includes(adapter.metadata.access)) throw new Error('Invalid adapter access class.');
      if (agent && JSON.stringify(adapter.metadata) !== JSON.stringify(agent)) throw new Error('Adapter metadata must remain constant within a run.');
      agent = structuredClone(adapter.metadata);
      trials.push(await runTrial(browser, server.url, scenario, index + 1, plan.length, adapter, config.screenshotsPerSecond));
    }
    const report: RunReport = { schemaVersion: 1, runId: randomUUID(), createdAt: new Date().toISOString(), category: config.category,
      benchmark: benchmarkProvenance(),
      comparisonClass: agent!.access === 'privileged-oracle' ? 'control-only' : 'visual', agent: agent!, config,
      environment: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
        browser: 'chromium', browserVersion: browser.version(), headless: !options.headed, nodeVersion: process.version,
        platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? 'unknown', cpuCount: cpus().length,
        memoryBytes: totalmem(), actionInterface: 'playwright-mouse', targetRadiusPx: config.category === 'target-acquisition' ? 13 : config.category === 'dynamic-tracking' ? dynamicTrackingTargetRadiusPx : 42, acquisitionObjectSizePx: 26,
        movementSpeedPxPerSecond: config.category === 'dynamic-tracking' ? dynamicTrackingSpeedPxPerSecond : null },
      trials, summary: summarize(trials, config.category),
    };
    if (options.outputDir) await writeReport(report, options.outputDir);
    return report;
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
}
