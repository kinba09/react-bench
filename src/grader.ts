import type { BrowserEvent, InhibitoryControlOutcome, InhibitoryControlScenario, Outcome, Scenario } from './types.js';

export interface GradeResult {
  outcome: Outcome;
  reactionLatencyMs: number | null;
  conditionOutcome?: InhibitoryControlOutcome;
}

export function grade(events: BrowserEvent[], scenario?: Scenario): GradeResult {
  const activation = events.find(event => event.type === 'activated');
  const click = events.find(event => event.type === 'action-registered');
  if (scenario?.category === 'inhibitory-control') return gradeInhibitoryControl(scenario, activation, click);
  if (!click) return { outcome: 'expired', reactionLatencyMs: null };
  if (!activation || click.atMs < activation.atMs) return { outcome: 'premature', reactionLatencyMs: null };
  if (click.atMs >= activation.deadlineAtMs!) return { outcome: 'expired', reactionLatencyMs: null };
  if (!click.hit) return { outcome: 'wrong', reactionLatencyMs: null };
  return { outcome: 'success', reactionLatencyMs: click.atMs - activation.atMs };
}

function gradeInhibitoryControl(scenario: InhibitoryControlScenario,
  activation: BrowserEvent | undefined, click: BrowserEvent | undefined): GradeResult {
  if (scenario.condition === 'no-go') {
    if (click && activation && click.atMs >= activation.deadlineAtMs!) {
      return { outcome: 'success', reactionLatencyMs: null, conditionOutcome: 'withheld' };
    }
    return click
      ? { outcome: 'wrong', reactionLatencyMs: null, conditionOutcome: 'forbidden-click' }
      : { outcome: 'success', reactionLatencyMs: null, conditionOutcome: 'withheld' };
  }
  if (!click) return { outcome: 'expired', reactionLatencyMs: null, conditionOutcome: 'go-omission' };
  if (!activation || click.atMs < activation.atMs) {
    return { outcome: 'premature', reactionLatencyMs: null, conditionOutcome: 'go-premature-click' };
  }
  if (click.atMs >= activation.deadlineAtMs!) {
    return { outcome: 'expired', reactionLatencyMs: null, conditionOutcome: 'go-omission' };
  }
  if (!click.hit) return { outcome: 'wrong', reactionLatencyMs: null, conditionOutcome: 'go-wrong-click' };
  return { outcome: 'success', reactionLatencyMs: click.atMs - activation.atMs, conditionOutcome: 'go-response' };
}
