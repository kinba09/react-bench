import type { BrowserDisplay, BrowserEnvironment, Category, SessionCompletion, SessionView } from './types.js';

export async function connectSession(environment: BrowserEnvironment, describeTask: (category: Category, responseWindowMs: number) => void,
  onComplete: (callback: () => void) => void): Promise<void> {
  const id = location.pathname.split('/')[2]!;
  const api = `/api/session/${id}`;
  const controls = document.querySelector<HTMLElement>('#session-controls')!;
  const message = document.querySelector<HTMLElement>('#session-message')!;
  const start = document.querySelector<HTMLButtonElement>('#session-start')!;
  const next = document.querySelector<HTMLButtonElement>('#session-next')!;
  const quiescence = document.querySelector<HTMLElement>('#session-quiescence')!;
  const actionsSettled = document.querySelector<HTMLInputElement>('#session-actions-settled')!;
  const cancel = document.querySelector<HTMLButtonElement>('#session-cancel')!;
  const retry = document.querySelector<HTMLButtonElement>('#session-retry')!;
  const links = document.querySelector<HTMLElement>('#session-downloads')!;
  const arena = document.querySelector<HTMLElement>('.arena-shell')!;
  const key = `reactbench-participant-${id}`;
  const clientId = sessionStorage.getItem(key) ?? crypto.randomUUID();
  sessionStorage.setItem(key, clientId);
  const display = (): BrowserDisplay => ({ viewport: { width: innerWidth, height: innerHeight },
    deviceScaleFactor: devicePixelRatio, userAgent: navigator.userAgent });
  let current: SessionView;
  let pendingCompletion: SessionCompletion | undefined;
  let pendingCancellation = false;
  let hasPreparedTrial = false;
  let trialDisplay = display();
  let nextPauseFinished = false;
  controls.hidden = false;
  arena.hidden = true;
  document.querySelector<HTMLElement>('#mode')!.textContent = 'Scored browser session';
  document.querySelector<HTMLElement>('#session-id')!.textContent = `Session ${id.slice(0, 8)}`;
  links.querySelectorAll<HTMLAnchorElement>('a').forEach(link => { link.href = `${api}/${link.dataset.file}`; });

  async function request(action: string, body: Record<string, unknown> = {}): Promise<SessionView> {
    cancel.disabled = true;
    retry.disabled = true;
    actionsSettled.disabled = true;
    try {
      const response = await fetch(`${api}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...body }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? 'Session request failed.');
      return value as SessionView;
    } finally {
      cancel.disabled = false;
      retry.disabled = false;
      actionsSettled.disabled = false;
    }
  }
  function show(view: SessionView) {
    current = view;
    document.querySelector<HTMLElement>('#progress')!.textContent = `Trial ${view.index} of ${view.total}`;
    document.querySelector<HTMLElement>('#level-label')!.textContent = `Level ${view.level}`;
    start.disabled = view.state !== 'ready';
    start.textContent = `Start trial ${view.index}`;
    next.hidden = view.state !== 'between-trials';
    next.disabled = true;
    nextPauseFinished = false;
    actionsSettled.checked = false;
    quiescence.hidden = view.state !== 'between-trials';
    cancel.hidden = view.state === 'complete' || view.state === 'cancelled';
    retry.hidden = true;
    if (!hasPreparedTrial && view.state !== 'ready') describeTask(view.category, view.responseWindowMs);
    if (view.state === 'ready' && view.scenario) {
      arena.hidden = false;
      environment.prepare(view.scenario, view.index, view.total);
      hasPreparedTrial = true;
      message.textContent = `Read the rules, then start. ${view.total} scored trials; use your own browser/computer tools.`;
    } else if (view.state === 'between-trials') {
      if (!hasPreparedTrial) {
        document.querySelector<HTMLElement>('#status')!.textContent = 'Trial complete';
        document.querySelector<HTMLElement>('#instruction')!.textContent = 'Prepare the next trial when you are ready.';
      }
      message.textContent = `Trial ${view.index} recorded. Finish any pending actions, then prepare the next trial. Its clock will wait for Start.`;
      setTimeout(() => {
        if (current === view && current.state === 'between-trials' && !pendingCancellation) {
          nextPauseFinished = true;
          next.disabled = !actionsSettled.checked;
        }
      }, 550);
    } else if (view.state === 'complete' || view.state === 'cancelled') {
      if (hasPreparedTrial) environment.cancel();
      start.hidden = true;
      links.hidden = false;
      document.querySelector<HTMLElement>('#status')!.textContent = view.state === 'complete' ? 'Session complete' : 'Session cancelled';
      document.querySelector<HTMLElement>('#instruction')!.textContent = view.state === 'complete'
        ? 'All trials recorded. Open the report to inspect your results.' : 'This run is incomplete. Only finished trials are included.';
      const lastResult = document.querySelector<HTMLElement>('#result')!;
      if (lastResult.textContent === '—') lastResult.textContent = view.state === 'complete' ? 'See report' : 'Not scored';
      message.textContent = view.state === 'complete'
        ? `${view.correct} / ${view.total} correct. Results saved.` : 'Session cancelled. Partial results saved; unfinished trials are not scored.';
    }
  }
  function failed(error: unknown) {
    message.textContent = `${error instanceof Error ? error.message : 'Session request failed.'} Use Retry to try again.`;
    retry.hidden = false;
    start.disabled = true;
    next.disabled = true;
    nextPauseFinished = false;
  }
  async function submitCompletion() {
    start.disabled = true;
    next.disabled = true;
    cancel.disabled = true;
    message.textContent = 'Recording trial…';
    try {
      const result = await request('complete', pendingCompletion as unknown as Record<string, unknown>);
      pendingCompletion = undefined;
      show(result);
    } catch (error) { failed(error); }
    finally { cancel.disabled = false; }
  }
  onComplete(() => {
    if (current?.state !== 'active') return;
    const snapshot = environment.snapshot();
    pendingCompletion = { clientId, trialId: snapshot.trialId, events: snapshot.events,
      browserTimeOriginMs: performance.timeOrigin, display: trialDisplay };
    void submitCompletion();
  });
  start.addEventListener('click', async () => {
    if (start.disabled || current.state !== 'ready') return;
    start.disabled = true;
    cancel.disabled = true;
    message.textContent = 'Starting trial…';
    try {
      current = await request('start', { trialId: current.scenario!.id, display: display() });
      trialDisplay = display();
      environment.start();
      message.textContent = 'Trial running. Follow the game instructions above.';
    } catch (error) { failed(error); }
    finally { cancel.disabled = false; }
  });
  next.addEventListener('click', async () => {
    if (next.disabled || !actionsSettled.checked) return;
    next.disabled = true;
    cancel.disabled = true;
    message.textContent = 'Preparing next trial…';
    try { show(await request('next', { actionsSettled: true })); } catch (error) { failed(error); }
    finally { cancel.disabled = false; }
  });
  actionsSettled.addEventListener('change', () => {
    next.disabled = current.state !== 'between-trials' || !nextPauseFinished || !actionsSettled.checked;
  });
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    start.disabled = true;
    next.disabled = true;
    actionsSettled.disabled = true;
    pendingCancellation = true;
    message.textContent = 'Cancelling session…';
    if (hasPreparedTrial) environment.cancel();
    try { show(await request('cancel', { display: display() })); pendingCancellation = false; } catch (error) { failed(error); }
    finally { cancel.disabled = false; actionsSettled.disabled = false; }
  });
  async function connect() {
    message.textContent = 'Connecting to the session…';
    show(await request('connect', { display: display() }));
    if (current.state === 'active') message.textContent = 'This trial was already started. Reloading cannot restart it. Cancel this session and start a new run.';
  }
  retry.addEventListener('click', async () => {
    retry.hidden = true;
    if (pendingCancellation) {
      message.textContent = 'Cancelling session…';
      try { show(await request('cancel', { display: display() })); pendingCancellation = false; } catch (error) { failed(error); }
    } else if (pendingCompletion) await submitCompletion();
    else { try { await connect(); } catch (error) { failed(error); } }
  });
  try { await connect(); } catch (error) { failed(error); }
}
