import { mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { inhibitoryControlConditions, taskRegistry } from './registry.js';
import type { Category, InhibitoryControlCondition, Level, RunReport, RunSummary, TrialResult } from './types.js';

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function responseTimes(trials: TrialResult[]): number[] {
  return trials.flatMap(trial => trial.timing.reactionLatencyMs === null ? [] : [trial.timing.reactionLatencyMs]);
}
function summarizeInhibitoryCondition(trials: TrialResult[], condition: InhibitoryControlCondition) {
  const group = trials.filter(trial => trial.scenario.category === 'inhibitory-control' && trial.scenario.condition === condition);
  return { condition, total: group.length,
    correct: group.filter(trial => trial.outcome === 'success').length,
    medianReactionLatencyMs: condition === 'go' ? median(responseTimes(group)) : null };
}
export function summarize(trials: TrialResult[], category: Category = 'visual-reaction'): RunSummary {
  const correct = trials.filter(trial => trial.outcome === 'success').length;
  const levels = [...new Set(trials.map(trial => trial.scenario.level))].sort();
  const inhibitoryTrials = trials.filter(trial => trial.scenario.category === 'inhibitory-control');
  const recordedConditions = inhibitoryControlConditions.filter(condition => inhibitoryTrials.some(trial =>
    trial.scenario.category === 'inhibitory-control' && trial.scenario.condition === condition));
  const inhibitoryOutcomes = Object.fromEntries((['go-response', 'go-omission', 'go-wrong-click', 'go-premature-click',
    'forbidden-click', 'withheld', 'pre-stop-click', 'post-stop-click', 'stop-withheld'] as const)
    .map(outcome => [outcome, inhibitoryTrials.filter(trial => trial.conditionOutcome === outcome).length])) as NonNullable<RunSummary['inhibitoryControl']>['outcomes'];
  const inhibitoryControl = category === 'inhibitory-control' ? {
    byCondition: recordedConditions.map(condition => summarizeInhibitoryCondition(inhibitoryTrials, condition)),
    byLevel: levels.map(level => ({ level: level as Level, byCondition: recordedConditions
      .map(condition => summarizeInhibitoryCondition(inhibitoryTrials.filter(trial => trial.scenario.level === level), condition)) })),
    outcomes: inhibitoryOutcomes,
  } : undefined;
  return { category, total: trials.length, correct, completionRate: trials.length ? correct / trials.length : 0,
    medianReactionLatencyMs: median(responseTimes(trials)),
    p95: { value: null, status: 'insufficient-samples' },
    failures: { premature: trials.filter(x => x.outcome === 'premature').length,
      wrong: trials.filter(x => x.outcome === 'wrong').length, expired: trials.filter(x => x.outcome === 'expired').length },
    byLevel: levels.map(level => {
      const group = trials.filter(trial => trial.scenario.level === level);
      const scenario = group[0]?.scenario;
      return { level: level as Level, total: group.length,
        correct: group.filter(x => x.outcome === 'success').length, medianReactionLatencyMs: median(responseTimes(group)),
        objectsPerTrial: scenario?.category === 'target-acquisition' || scenario?.category === 'dynamic-tracking' ? scenario.objects.length : null };
    }),
    ...(inhibitoryControl ? { inhibitoryControl } : {}),
  };
}
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
const duration = (value: number | null): string => value === null ? 'Unavailable' : `${value.toFixed(1)} ms`;

const inhibitoryConditionLabel: Record<InhibitoryControlCondition, string> = {
  go: 'Go',
  'no-go': 'No-go',
  'delayed-stop': 'Delayed-stop',
};

function renderInhibitoryResults(report: RunReport): string {
  const summary = report.summary.inhibitoryControl;
  if (!summary) return '';
  const cueLabels: Record<InhibitoryControlCondition, string> = {
    go: 'Go · green',
    'no-go': 'No-go · red',
    'delayed-stop': 'Delayed-stop · green to red',
  };
  const hasGo = summary.byCondition.some(row => row.condition === 'go');
  const hasDelayedStop = summary.byCondition.some(row => row.condition === 'delayed-stop');
  const byCondition = summary.byCondition.map(row =>
    `<tr><td>${cueLabels[row.condition]}</td><td>${row.correct} / ${row.total}</td><td>${duration(row.medianReactionLatencyMs)}</td></tr>`).join('');
  const levelHeadings = summary.byCondition.map(row => `<th>${inhibitoryConditionLabel[row.condition]} correct / total</th>`).join('');
  const byLevel = summary.byLevel.map(row => {
    const conditions = row.byCondition.map(condition => `<td>${condition.correct} / ${condition.total}</td>`).join('');
    const goLatency = row.byCondition.find(condition => condition.condition === 'go')?.medianReactionLatencyMs ?? null;
    return `<tr><td>${row.level}</td>${conditions}${hasGo ? `<td>${duration(goLatency)}</td>` : ''}</tr>`;
  }).join('');
  const stopTiming = report.trials.flatMap(trial => {
    const { scenario } = trial;
    if (scenario.category !== 'inhibitory-control' || scenario.condition !== 'delayed-stop') return [];
    const activation = trial.events.find(event => event.type === 'activated');
    const signal = trial.events.find(event => event.type === 'stop-signal');
    const observedDelay = activation && signal ? signal.atMs - activation.atMs : null;
    return [`<tr><td>${escape(trial.id)}</td><td>${duration(scenario.nominalStopDelayMs)}</td><td>${duration(scenario.plannedStopDelayMs)}</td><td>${duration(observedDelay)}</td></tr>`];
  }).join('');
  return `<h2>By cue condition</h2><div class="scroll"><table><thead><tr><th>Condition</th><th>Correct / total</th><th>Valid go-response median</th></tr></thead><tbody>${byCondition}</tbody></table></div>
<h3>By level</h3><div class="scroll"><table><thead><tr><th>Level</th>${levelHeadings}${hasGo ? '<th>Valid go-response median</th>' : ''}</tr></thead><tbody>${byLevel}</tbody></table></div>
<p>Successful go responses: ${summary.outcomes['go-response']} · Go omissions: ${summary.outcomes['go-omission']} · Forbidden clicks: ${summary.outcomes['forbidden-click']} · Correctly withheld on no-go: ${summary.outcomes.withheld}</p>
${hasDelayedStop ? `<p>Delayed-stop withholding: ${summary.outcomes['stop-withheld']} · Clicks before stop: ${summary.outcomes['pre-stop-click']} · Clicks after stop: ${summary.outcomes['post-stop-click']}</p>
<h3>Delayed-stop timing after go cue</h3><div class="scroll"><table><thead><tr><th>Trial</th><th>Nominal delay</th><th>Planned delay</th><th>Observed delay</th></tr></thead><tbody>${stopTiming}</tbody></table></div>` : ''}`;
}

export function renderReport(report: RunReport): string {
  const control = report.comparisonClass === 'control-only';
  const targetAcquisition = report.category === 'target-acquisition';
  const dynamicTracking = report.category === 'dynamic-tracking';
  const showObjectCounts = targetAcquisition || dynamicTracking;
  const inhibitory = report.category === 'inhibitory-control';
  const categoryTitle = taskRegistry[report.category].title;
  const crowdingNote = targetAcquisition
    ? `One matching shape among static objects. Each object is ${report.environment.acquisitionObjectSizePx} CSS pixels in diameter; response limit is 10 seconds.`
    : dynamicTracking ? `Click the moving star among 1, 5, 15, 30, or 60 objects. Levels 4–5 add a 1.5-second Watch phase and a level-specific Hidden phase. Radius: ${report.environment.targetRadiusPx} CSS px; speed: ${report.environment.movementSpeedPxPerSecond} CSS px/s. Timing starts when the target reappears.`
    : inhibitory ? 'Go cues require one correct click. No-go and delayed-stop trials require withholding every click. Delayed-stop trials start green and then show a red stop cue.'
      : 'A single target changes from red to green, with response windows that shorten by level.';
  const inhibitoryResults = renderInhibitoryResults(report);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ReactBench · ${categoryTitle} results</title><style>
body{font:15px/1.6 system-ui,sans-serif;color:#20252e;background:#f5f6f8;max-width:1080px;margin:48px auto;padding:0 24px}h1{font-size:32px;letter-spacing:-.03em}h2{margin-top:36px;font-size:20px}p{max-width:75ch}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #dce0e5}th{font-size:12px}code{overflow-wrap:anywhere}details{margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow-x:auto}.note{padding:18px;background:#fff}dt{color:#616a76}dd{margin:0 0 12px}a{color:#245b8b;text-underline-offset:3px}
 </style></head><body><p>ReactBench / ${categoryTitle}</p><h1>${control ? 'Control baseline' : 'Visual agent'} results</h1>
<p class="note">${control ? 'Privileged oracle. This setup reads hidden environment state and is excluded from fair visual-agent comparisons.' : 'External agent uses its own browser/computer tools. Task scores use browser-registered events.'}</p>
<p>${crowdingNote}</p>
<p>Run status: ${report.status}. Recorded ${report.trials.length} of ${report.plannedTrials} planned trials. Cancelled runs are incomplete.</p>
<p><strong>${report.summary.correct} / ${report.summary.total}</strong> correct · ${inhibitory ? 'Valid go-response' : 'Successful-response'} median: ${duration(report.summary.medianReactionLatencyMs)} · P95: insufficient samples (unavailable in this initial slice).</p>
<p>${inhibitory ? 'Latency includes successful go responses only. Withholding has no click time and receives no reaction latency.' : 'Median includes successful responses only.'} Failures remain in the counts. Timings measure software activation to browser input registration, not physical display onset.</p>
<h2>By difficulty</h2><div class="scroll"><table><thead><tr><th>Level</th>${showObjectCounts ? '<th>Objects</th>' : ''}<th>Correct / total</th><th>Successful-response median</th></tr></thead><tbody>${report.summary.byLevel.map(level => `<tr><td>${level.level}</td>${showObjectCounts ? `<td>${level.objectsPerTrial ?? 'Unavailable'}</td>` : ''}<td>${level.correct} / ${level.total}</td><td>${duration(level.medianReactionLatencyMs)}</td></tr>`).join('')}</tbody></table></div>
${inhibitoryResults}
<h2>Failures</h2><p>Premature: ${report.summary.failures.premature} · ${targetAcquisition ? 'Wrong choice' : 'Wrong target'}: ${report.summary.failures.wrong} · Expired: ${report.summary.failures.expired}</p>
<h2>Individual trials</h2><div class="scroll"><table><thead><tr><th>Trial</th><th>Level</th>${inhibitory ? '<th>Condition</th>' : ''}${showObjectCounts ? '<th>Objects</th>' : ''}<th>Outcome</th><th>Response</th></tr></thead><tbody>${report.trials.map(trial => `<tr><td>${escape(trial.id)}</td><td>${trial.scenario.level}</td>${inhibitory && trial.scenario.category === 'inhibitory-control' ? `<td>${trial.scenario.condition}</td>` : ''}${showObjectCounts ? `<td>${trial.scenario.category === 'target-acquisition' || trial.scenario.category === 'dynamic-tracking' ? trial.scenario.objects.length : '—'}</td>` : ''}<td>${escape(trial.conditionOutcome ?? trial.outcome)}</td><td>${duration(trial.timing.reactionLatencyMs)}</td></tr>`).join('')}</tbody></table></div>
<h2>Evaluated setup</h2><dl><dt>Agent</dt><dd>${escape(report.agent.name)}</dd><dt>Browser/computer tool</dt><dd>${escape(report.agent.tool ?? 'Unavailable')}</dd><dt>Agent context policy</dt><dd>${escape(report.agent.contextPolicy ?? 'Unavailable')}</dd><dt>Model</dt><dd>${escape(report.agent.model ?? 'Unavailable')}</dd><dt>Benchmark / adapter version</dt><dd>${escape(report.benchmark.version)} / ${escape(report.agent.adapterVersion ?? 'Unavailable')}</dd><dt>Source revision</dt><dd>${escape(report.benchmark.gitCommit ?? 'Unavailable')}${report.benchmark.trackedChanges ? ' (tracked changes present)' : ''}</dd><dt>Display / input</dt><dd>${report.environment.viewport ? `${report.environment.viewport.width} × ${report.environment.viewport.height}` : 'Unavailable'} · scale ${report.environment.deviceScaleFactor ?? 'Unavailable'} · ${escape(report.environment.actionInterface)}</dd><dt>Browser / Playwright</dt><dd>${escape(report.environment.browserVersion ?? 'Unavailable')} / ${escape(report.benchmark.playwrightVersion)}</dd><dt>Hardware</dt><dd>${escape(report.environment.cpu)} · ${report.environment.cpuCount} logical CPUs · ${escape(report.environment.platform)} / ${escape(report.environment.architecture)}</dd><dt>Internal model processing</dt><dd>Unavailable</dd></dl>
<p><a href="results.json">Run data (JSON)</a> · <a href="trials.jsonl">Trial logs (JSONL)</a></p>
<details><summary>Configuration and provenance</summary><pre>${escape(JSON.stringify({ runId: report.runId, benchmark: report.benchmark, config: report.config, environment: report.environment }, null, 2))}</pre></details>
</body></html>`;
}

export async function writeReport(report: RunReport, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const written: string[] = [];
  try {
    for (const [name, content] of [
      ['results.json', JSON.stringify(report, null, 2) + '\n'],
      ['trials.jsonl', report.trials.map(trial => JSON.stringify(trial)).join('\n') + '\n'],
      ['report.html', renderReport(report)],
    ] as const) {
      const file = join(outputDir, name);
      const handle = await open(file, 'wx');
      written.push(file);
      try { await handle.writeFile(content); } finally { await handle.close(); }
    }
  } catch (error) {
    await Promise.all(written.map(file => rm(file, { force: true })));
    throw error;
  }
}
