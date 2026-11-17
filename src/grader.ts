import type { BrowserEvent, Outcome } from './types.js';

export function grade(events: BrowserEvent[]): { outcome: Outcome; reactionLatencyMs: number | null } {
  const activation = events.find(event => event.type === 'activated');
  const click = events.find(event => event.type === 'action-registered');
  if (!click) return { outcome: 'expired', reactionLatencyMs: null };
  if (!activation || click.atMs < activation.atMs) return { outcome: 'premature', reactionLatencyMs: null };
  if (click.atMs >= activation.deadlineAtMs!) return { outcome: 'expired', reactionLatencyMs: null };
  if (!click.hit) return { outcome: 'wrong', reactionLatencyMs: null };
  return { outcome: 'success', reactionLatencyMs: click.atMs - activation.atMs };
}
