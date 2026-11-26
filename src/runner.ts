import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { OracleAdapter } from './adapters/oracle.js';
import { grade } from './grader.js';
import { createPlan, defaultConfig, taskRegistry, validateConfig } from './registry.js';
import { writeReport } from './reporter.js';
import { createRunReport } from './run-report.js';
import { startServer } from './server.js';
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
  adapter: AgentAdapter): Promise<TrialResult> {
  const preparationStart = performance.now();
  const browserContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
    reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light' });
  const controller = new AbortController();
  try {
    const page: Page = await browserContext.newPage();
    await page.goto(`${url}/?controlled=1&access=${adapter.metadata.access}`);
    await page.waitForFunction(() => Boolean(window.reactBenchEnvironment));
    await page.evaluate(({ scenario, index, total }) => window.reactBenchEnvironment.prepare(scenario, index, total), { scenario, index, total });
    const browserTimeOriginMs = await page.evaluate(() => performance.timeOrigin);
    const actions: ActionRecord[] = [];
    let started = false;
    let attempted = false;
    const context: VisualContext = {
      trialId: scenario.id, instructions: taskRegistry[scenario.category].instructions, signal: controller.signal,
      input: {
        async click(x, y) {
          if (controller.signal.aborted || attempted) return;
          if (!started) throw new Error('Input is unavailable during preparation.');
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1280 || y >= 720) throw new Error('Click coordinates must be finite viewport CSS pixels.');
          attempted = true;
          const action: ActionRecord = { id: `${scenario.id}/action-1`, type: 'click', x, y,
            submittedAtMs: performance.now(), decisionCompletedAtMs: null,
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
    await Promise.race([prepare, sleep(30_000, undefined, { ref: false }).then(() => { throw new Error('Adapter preparation timed out.'); })]);
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
        failure,
      ]);
    } finally {
      controller.abort();
    }
    await Promise.race([settledTask, sleep(500, undefined, { ref: false })]);
    const snapshot = await page.evaluate(() => window.reactBenchEnvironment.snapshot());
    const graded = grade(snapshot.events, scenario);
    return { id: scenario.id, scenario, outcome: graded.outcome,
      ...(graded.conditionOutcome ? { conditionOutcome: graded.conditionOutcome } : {}), events: snapshot.events,
      actions,
      timing: { preparationMs, reactionLatencyMs: graded.reactionLatencyMs, modelProcessingMs: null,
        preparationClock: 'runner-performance', browserTimeOriginMs, runnerClock: 'runner-performance', reactionClock: 'browser-performance',
        measurement: 'software-activation-to-input-handler' },
    };
  } finally {
    controller.abort();
    await browserContext.close();
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
      trials.push(await runTrial(browser, server.url, scenario, index + 1, plan.length, adapter));
    }
    const report = createRunReport(config, agent!, trials, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
      browser: 'chromium', browserVersion: browser.version(), headless: !options.headed, actionInterface: 'playwright-mouse' });
    if (options.outputDir) await writeReport(report, options.outputDir);
    return report;
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
}
