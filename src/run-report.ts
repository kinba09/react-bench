import { randomUUID } from 'node:crypto';
import { cpus, platform, arch, totalmem } from 'node:os';
import { benchmarkProvenance } from './provenance.js';
import { createPlan, dynamicTrackingSpeedPxPerSecond, dynamicTrackingTargetRadiusPx } from './registry.js';
import { summarize } from './reporter.js';
import type { AgentMetadata, BenchmarkConfig, RunReport, TrialResult } from './types.js';

type DisplayEnvironment = Pick<RunReport['environment'], 'viewport' | 'deviceScaleFactor' | 'browser' | 'browserVersion' | 'headless' | 'actionInterface'>;

export function createRunReport(config: BenchmarkConfig, agent: AgentMetadata, trials: TrialResult[],
  display: DisplayEnvironment, runId = randomUUID(), status: RunReport['status'] = 'complete'): RunReport {
  return {
    schemaVersion: 2, status, plannedTrials: createPlan(config).length, runId, createdAt: new Date().toISOString(),
    category: config.category, benchmark: benchmarkProvenance(),
    comparisonClass: agent.access === 'privileged-oracle' ? 'control-only' : 'visual', agent, config,
    environment: { ...display, nodeVersion: process.version, platform: platform(), architecture: arch(),
      cpu: cpus()[0]?.model ?? 'unknown', cpuCount: cpus().length, memoryBytes: totalmem(),
      targetRadiusPx: config.category === 'target-acquisition' ? 13 : config.category === 'dynamic-tracking' ? dynamicTrackingTargetRadiusPx : 42,
      acquisitionObjectSizePx: 26, movementSpeedPxPerSecond: config.category === 'dynamic-tracking' ? dynamicTrackingSpeedPxPerSecond : null },
    trials, summary: summarize(trials, config.category),
  };
}
