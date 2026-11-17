import type { BrowserEvent, Category, Outcome } from './types.js';

export function grade(events: BrowserEvent[], category: Category = 'visual-reaction'): { outcome: Outcome; reactionLatencyMs: number | null } {
  if (category === 'dynamic-tracking') {
    const start = events.find(event => event.type === 'started');
    const click = events.find(event => event.type === 'action-registered');
    if (!click || !start) return { outcome: 'expired', reactionLatencyMs: null };
    if (start.deadlineAtMs !== undefined && click.atMs >= start.deadlineAtMs) return { outcome: 'expired', reactionLatencyMs: null };
    if (!click.hit) return { outcome: 'wrong', reactionLatencyMs: null };
    return { outcome: 'success', reactionLatencyMs: click.atMs - start.atMs };
  }
  const activation = events.find(event => event.type === 'activated');
  const click = events.find(event => event.type === 'action-registered');
  if (!click) return { outcome: 'expired', reactionLatencyMs: null };
  if (!activation || click.atMs < activation.atMs) return { outcome: 'premature', reactionLatencyMs: null };
  if (click.atMs >= activation.deadlineAtMs!) return { outcome: 'expired', reactionLatencyMs: null };
  if (!click.hit) return { outcome: 'wrong', reactionLatencyMs: null };
  return { outcome: 'success', reactionLatencyMs: click.atMs - activation.atMs };
}
