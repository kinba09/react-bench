import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { grade } from './grader.js';
import { createPlan, defaultConfig, validateConfig } from './registry.js';
import { createRunReport } from './run-report.js';
import { renderReport, writeReport } from './reporter.js';
import { startServer } from './server.js';
import type { AgentMetadata, BrowserDisplay, BrowserEvent, RunReport, SessionCompletion, SessionView, TrialResult, VisualReactionConfig } from './types.js';

export interface SessionOptions {
  config?: VisualReactionConfig;
  outputDir: string;
  port?: number;
  agent?: AgentMetadata & { access: 'visual' };
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function requireThat(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new RequestError(status, message);
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function displayFrom(value: unknown): BrowserDisplay {
  const display = value as BrowserDisplay | undefined;
  requireThat(display && finite(display.viewport?.width) && display.viewport.width > 0 && display.viewport.width <= 32768
    && finite(display.viewport.height) && display.viewport.height > 0 && display.viewport.height <= 32768
    && finite(display.deviceScaleFactor) && display.deviceScaleFactor > 0 && display.deviceScaleFactor <= 10
    && typeof display.userAgent === 'string' && display.userAgent.length <= 2000, 'Invalid browser display metadata.');
  return structuredClone(display);
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  requireThat(request.headers['content-type']?.split(';')[0] === 'application/json', 'Expected application/json.', 415);
  let raw = '';
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    requireThat(size <= 256 * 1024, 'Request body is too large.', 413);
    raw += chunk;
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new RequestError(400, 'Invalid JSON.'); }
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object.');
  return value as Record<string, unknown>;
}

function completionFrom(body: Record<string, unknown>, trialId: string): SessionCompletion {
  requireThat(body.trialId === trialId, 'This is not the active trial.', 409);
  requireThat(finite(body.browserTimeOriginMs) && body.browserTimeOriginMs > 0, 'Invalid browser clock origin.');
  const events = body.events as BrowserEvent[] | undefined;
  requireThat(Array.isArray(events) && events.length >= 3 && events.length <= 100, 'Invalid trial event trace.');
  let previous = -1;
  for (const event of events) {
    requireThat(event && event.trialId === trialId && event.clock === 'browser-performance' && finite(event.atMs)
      && event.atMs >= previous && ['prepared', 'started', 'activated', 'action-registered', 'expired'].includes(event.type), 'Invalid trial event or clock.');
    requireThat(['prepared', 'waiting', 'active', 'complete'].includes(event.phase), 'Invalid event phase.');
    previous = event.atMs;
    if (event.type === 'action-registered') requireThat(finite(event.x) && finite(event.y)
      && typeof event.hit === 'boolean' && event.inputTrusted === true, 'Expected a browser-registered click.');
    if (event.type === 'activated') requireThat(finite(event.deadlineAtMs) && event.deadlineAtMs > event.atMs, 'Invalid activation deadline.');
  }
  requireThat(events[0]?.type === 'prepared' && events[1]?.type === 'started'
    && events.filter(event => event.type === 'prepared').length === 1
    && events.filter(event => event.type === 'started').length === 1
    && events.filter(event => event.type === 'activated').length <= 1
    && events.filter(event => event.type === 'action-registered').length <= 1, 'Invalid trial lifecycle.');
  const last = events.at(-1)!;
  requireThat(last.type === 'action-registered' || last.type === 'expired', 'The trial has not finished.');
  if (last.type === 'expired') {
    const active = events.find(event => event.type === 'activated');
    requireThat(active && last.atMs >= active.deadlineAtMs!, 'The response window has not expired.');
  }
  return { clientId: body.clientId as string, trialId, events: structuredClone(events),
    browserTimeOriginMs: body.browserTimeOriginMs, display: displayFrom(body.display) };
}

/** Local, trusted browser session. Agents bring their own observation and input tools. */
export async function startBrowserSession(options: SessionOptions) {
  const config = validateConfig(options.config ?? { ...defaultConfig, levels: [1], trialsPerLevel: 3 });
  if (config.category !== 'visual-reaction') throw new Error('Browser sessions currently support Visual Reaction only.');
  for (const name of ['results.json', 'trials.jsonl', 'report.html']) {
    try { await access(join(options.outputDir, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    throw new Error(`Results already exist in ${options.outputDir}; choose a new output directory.`);
  }
  const id = randomUUID();
  const plan = createPlan(config);
  const trials: TrialResult[] = [];
  const submitted = new Map<string, string>();
  const agent: AgentMetadata = structuredClone(options.agent ?? { name: 'external-browser-agent', model: null, access: 'visual' as const,
    tool: 'unspecified', contextPolicy: 'Managed by the external agent/operator; not reset by ReactBench.' });
  if (agent.access !== 'visual') throw new Error('Browser sessions require an external visual agent.');
  let state: SessionView['state'] = 'ready';
  let index = 0;
  let clientId: string | undefined;
  let display: BrowserDisplay | undefined;
  let readyAfterMs = 0;
  let report: RunReport | undefined;
  let resolveFinished!: (report: RunReport) => void;
  const finished = new Promise<RunReport>(resolve => { resolveFinished = resolve; });
  const prefix = `/api/session/${id}`;
  let queue = Promise.resolve();
  const view = (): SessionView => ({ id, state, index: index + 1, total: plan.length,
    level: plan[index]!.level,
    scenario: state === 'ready' ? plan[index]! : null, correct: trials.filter(trial => trial.outcome === 'success').length });
  async function save(status: RunReport['status']) {
    if (report) return;
    const result = createRunReport(config, agent, trials, {
      viewport: display?.viewport ?? null, deviceScaleFactor: display?.deviceScaleFactor ?? null,
      browser: display?.userAgent ?? 'Unavailable: no participant connected', browserVersion: null, headless: null,
      actionInterface: 'external-browser-tools',
    }, id, status);
    await writeReport(result, options.outputDir);
    report = result;
    resolveFinished(result);
  }
  async function cancel() {
    if (state === 'complete') { await save('complete'); return; }
    state = 'cancelled';
    await save('cancelled');
  }
  function send(response: ServerResponse, status: number, value: unknown, type = 'application/json') {
    response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(type === 'application/json' ? JSON.stringify(value) : value as string);
  }
  async function mutate(action: string, body: Record<string, unknown>) {
    requireThat(typeof body.clientId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(body.clientId), 'Invalid participant identity.');
    if (action === 'connect') {
      requireThat(!clientId || clientId === body.clientId, 'This session is already open in another tab.', 409);
      displayFrom(body.display);
      return view();
    }
    if (action === 'start') {
      requireThat(!clientId || clientId === body.clientId, 'This session is already open in another tab.', 409);
      requireThat(state === 'ready' && body.trialId === plan[index]!.id, 'This trial is not ready to start.', 409);
      display = displayFrom(body.display);
      clientId = body.clientId;
      state = 'active';
      return view();
    }
    if (action === 'cancel' && !clientId) {
      display = displayFrom(body.display);
      clientId = body.clientId;
    }
    requireThat(clientId && clientId === body.clientId, 'Connect this participant before continuing.', 409);
    if (action === 'cancel') { await cancel(); return view(); }
    if (action === 'complete') {
      const prior = submitted.get(body.trialId as string);
      if (prior) {
        requireThat(prior === JSON.stringify(body), 'This trial has already been recorded with different evidence.', 409);
        if (state === 'complete') await save('complete');
        return view();
      }
      requireThat(state === 'active', 'No trial is accepting results.', 409);
      const scenario = plan[index]!;
      const completion = completionFrom(body, scenario.id);
      const prepared = completion.events[0]!;
      const started = completion.events[1]!;
      const activation = completion.events.find(event => event.type === 'activated');
      if (activation && scenario.category === 'visual-reaction') {
        requireThat(activation.atMs >= started.atMs + scenario.initialDelayMs
          && activation.deadlineAtMs === activation.atMs + scenario.responseWindowMs, 'Trace does not match this trial configuration.');
      }
      const graded = grade(completion.events, scenario);
      display = completion.display;
      trials.push({ id: scenario.id, scenario, ...graded, events: completion.events, actions: [], display: completion.display,
        timing: { preparationMs: started.atMs - prepared.atMs, preparationClock: 'browser-performance',
          reactionLatencyMs: graded.reactionLatencyMs, modelProcessingMs: null, browserTimeOriginMs: completion.browserTimeOriginMs,
          runnerClock: 'runner-performance', reactionClock: 'browser-performance', measurement: 'software-activation-to-input-handler' } });
      submitted.set(scenario.id, JSON.stringify(body));
      state = trials.length === plan.length ? 'complete' : 'between-trials';
      readyAfterMs = performance.now() + 500;
      if (state === 'complete') await save('complete');
      return view();
    }
    requireThat(state !== 'complete' && state !== 'cancelled', 'This session is closed.', 409);
    if (action === 'next') {
      requireThat(state === 'between-trials' && performance.now() >= readyAfterMs, 'Finish pending actions before preparing the next trial.', 409);
      index++;
      state = 'ready';
    } else throw new RequestError(404, 'Unknown session action.');
    return view();
  }
  const server = await startServer(options.port ?? 0, { sessionPath: `/session/${id}`,
    async handleRequest(request, response, path) {
      if (!path.startsWith('/api/')) return false;
      if (path !== prefix && !path.startsWith(`${prefix}/`)) { send(response, 404, { error: 'Session not found.' }); return true; }
      try {
        if (request.method === 'GET') {
          if (path === prefix) send(response, 200, view());
          else {
            requireThat(report, 'Results are not available until the session is closed.', 409);
            const file = path.slice(prefix.length + 1);
            if (file === 'results.json') send(response, 200, report);
            else if (file === 'trials.jsonl') send(response, 200, report.trials.map(trial => JSON.stringify(trial)).join('\n') + '\n', 'application/x-ndjson');
            else if (file === 'report.html') send(response, 200, renderReport(report), 'text/html');
            else throw new RequestError(404, 'Not found.');
          }
        } else {
          requireThat(request.method === 'POST', 'Method not allowed.', 405);
          const origin = request.headers.origin;
          requireThat(!origin || origin === `http://${request.headers.host}`, 'Cross-origin requests are not allowed.', 403);
          const body = await readBody(request);
          const operation = queue.then(() => mutate(path.slice(prefix.length + 1), body));
          queue = operation.then(() => {}, () => {});
          send(response, 200, await operation);
        }
      } catch (error) {
        send(response, error instanceof RequestError ? error.status : 500,
          { error: error instanceof RequestError ? error.message : 'Could not save session results. Check the output directory and retry.' });
      }
      return true;
    },
  });
  return { url: `${server.url}/session/${id}`, id, finished,
    cancel: () => { const operation = queue.then(cancel); queue = operation.then(() => {}, () => {}); return operation; },
    close: () => server.close() };
}
