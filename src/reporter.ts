import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { taskRegistry } from './registry.js';
import type { Category, Level, RunReport, RunSummary, TrialResult } from './types.js';

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function responseTimes(trials: TrialResult[]): number[] {
  return trials.flatMap(trial => trial.timing.reactionLatencyMs === null ? [] : [trial.timing.reactionLatencyMs]);
}
export function summarize(trials: TrialResult[], category: Category = 'visual-reaction'): RunSummary {
  const correct = trials.filter(trial => trial.outcome === 'success').length;
  const levels = [...new Set(trials.map(trial => trial.scenario.level))].sort();
  return { category, total: trials.length, correct, completionRate: trials.length ? correct / trials.length : 0,
    medianReactionLatencyMs: median(responseTimes(trials)),
    p95: { value: null, status: 'insufficient-samples' },
    failures: { premature: trials.filter(x => x.outcome === 'premature').length,
      wrong: trials.filter(x => x.outcome === 'wrong').length, expired: trials.filter(x => x.outcome === 'expired').length },
    byLevel: levels.map(level => {
      const group = trials.filter(trial => trial.scenario.level === level);
      return { level: level as Level, total: group.length,
        correct: group.filter(x => x.outcome === 'success').length, medianReactionLatencyMs: median(responseTimes(group)),
        objectsPerTrial: group[0] && group[0].scenario.category !== 'visual-reaction' ? group[0].scenario.objects.length : null };
    }),
  };
}
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
const duration = (value: number | null): string => value === null ? 'Unavailable' : `${value.toFixed(1)} ms`;

export function renderReport(report: RunReport): string {
  const control = report.comparisonClass === 'control-only';
  const targetAcquisition = report.category === 'target-acquisition';
  const dynamicTracking = report.category === 'dynamic-tracking';
  const showObjectCounts = targetAcquisition || dynamicTracking;
  const categoryTitle = taskRegistry[report.category].title;
  const crowdingNote = targetAcquisition
    ? `One matching shape among static objects. Each object is ${report.environment.acquisitionObjectSizePx} CSS pixels in diameter; response limit is 10 seconds.`
    : dynamicTracking ? `Click the moving star among 1, 5, 15, 30, or 60 objects. Levels 4–5 add a 1.5-second Watch phase and a level-specific Hidden phase. Radius: ${report.environment.targetRadiusPx} CSS px; speed: ${report.environment.movementSpeedPxPerSecond} CSS px/s. Timing starts when the target reappears.`
    : 'A single target changes from red to green, with response windows that shorten by level.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ReactBench · ${categoryTitle} results</title><style>
body{font:15px/1.6 system-ui,sans-serif;color:#20252e;background:#f5f6f8;max-width:1080px;margin:48px auto;padding:0 24px}h1{font-size:32px;letter-spacing:-.03em}h2{margin-top:36px;font-size:20px}p{max-width:75ch}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #dce0e5}th{font-size:12px}code{overflow-wrap:anywhere}details{margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow-x:auto}.note{padding:18px;background:#fff}dt{color:#616a76}dd{margin:0 0 12px}a{color:#245b8b;text-underline-offset:3px}
 </style></head><body><p>ReactBench / ${categoryTitle}</p><h1>${control ? 'Control baseline' : 'Visual agent'} results</h1>
<p class="note">${control ? 'Privileged oracle. This setup reads hidden environment state and is excluded from fair visual-agent comparisons.' : 'Visual-agent access through the screenshot/action contract.'}</p>
<p>${crowdingNote}</p>
<p><strong>${report.summary.correct} / ${report.summary.total}</strong> correct · Successful-response median: ${duration(report.summary.medianReactionLatencyMs)} · P95: insufficient samples (unavailable in this initial slice).</p>
<p>Median includes successful responses only. Failures remain in the counts. Timings measure software activation to browser input registration, not physical display onset.</p>
<h2>By difficulty</h2><div class="scroll"><table><thead><tr><th>Level</th>${showObjectCounts ? '<th>Objects</th>' : ''}<th>Correct / total</th><th>Successful-response median</th></tr></thead><tbody>${report.summary.byLevel.map(level => `<tr><td>${level.level}</td>${showObjectCounts ? `<td>${level.objectsPerTrial ?? 'Unavailable'}</td>` : ''}<td>${level.correct} / ${level.total}</td><td>${duration(level.medianReactionLatencyMs)}</td></tr>`).join('')}</tbody></table></div>
<h2>Failures</h2><p>Premature: ${report.summary.failures.premature} · ${targetAcquisition ? 'Wrong choice' : 'Wrong target'}: ${report.summary.failures.wrong} · Expired: ${report.summary.failures.expired}</p>
<h2>Individual trials</h2><div class="scroll"><table><thead><tr><th>Trial</th><th>Level</th>${showObjectCounts ? '<th>Objects</th>' : ''}<th>Outcome</th><th>Response</th><th>Captures</th><th>Achieved capture rate</th></tr></thead><tbody>${report.trials.map(trial => `<tr><td>${escape(trial.id)}</td><td>${trial.scenario.level}</td>${showObjectCounts ? `<td>${trial.scenario.category === 'visual-reaction' ? '—' : trial.scenario.objects.length}</td>` : ''}<td>${trial.outcome}</td><td>${duration(trial.timing.reactionLatencyMs)}</td><td>${trial.observations.length}</td><td>${trial.timing.measuredCaptureHz?.toFixed(2) ?? 'Unavailable'} Hz</td></tr>`).join('')}</tbody></table></div>
<h2>Evaluated setup</h2><dl><dt>Agent</dt><dd>${escape(report.agent.name)}</dd><dt>Model</dt><dd>${escape(report.agent.model ?? 'Unavailable')}</dd><dt>Benchmark / adapter version</dt><dd>${escape(report.benchmark.version)} / ${escape(report.agent.adapterVersion ?? 'Unavailable')}</dd><dt>Source revision</dt><dd>${escape(report.benchmark.gitCommit ?? 'Unavailable')}${report.benchmark.trackedChanges ? ' (tracked changes present)' : ''}</dd><dt>Display / input</dt><dd>1280 × 720 · scale 1 · ${escape(report.environment.actionInterface)}</dd><dt>Browser / Playwright</dt><dd>${escape(report.environment.browserVersion)} / ${escape(report.benchmark.playwrightVersion)}</dd><dt>Hardware</dt><dd>${escape(report.environment.cpu)} · ${report.environment.cpuCount} logical CPUs · ${escape(report.environment.platform)} / ${escape(report.environment.architecture)}</dd><dt>Internal model processing</dt><dd>Unavailable</dd></dl>
<p><a href="results.json">Run data (JSON)</a> · <a href="trials.jsonl">Trial logs (JSONL)</a></p>
<details><summary>Configuration and provenance</summary><pre>${escape(JSON.stringify({ runId: report.runId, benchmark: report.benchmark, config: report.config, environment: report.environment }, null, 2))}</pre></details>
</body></html>`;
}

export async function writeReport(report: RunReport, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }),
    writeFile(join(outputDir, 'trials.jsonl'), report.trials.map(trial => JSON.stringify(trial)).join('\n') + '\n', { flag: 'wx' }),
    writeFile(join(outputDir, 'report.html'), renderReport(report), { flag: 'wx' }),
  ]);
}
