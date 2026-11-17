import { setTimeout as sleep } from 'node:timers/promises';
import type { OracleContext, PrivilegedAdapter } from '../types.js';
import { benchmarkVersion } from '../provenance.js';

/** Privileged control: this deliberately uses environment state, never a fair visual competitor. */
export class OracleAdapter implements PrivilegedAdapter {
  metadata = { name: 'scripted-playwright-oracle', model: null, access: 'privileged-oracle' as const, adapterVersion: benchmarkVersion };
  async prepare(_context: OracleContext): Promise<void> {}
  async waitForActive(context: OracleContext): Promise<boolean> {
    while (!context.signal.aborted) {
      const state = await context.oracle.snapshot();
      if (state.phase === 'complete') return false;
      if (state.phase === 'active') return true;
      await sleep(10, undefined, { signal: context.signal });
    }
    return false;
  }
  async run(context: OracleContext): Promise<void> {
    if (!await this.waitForActive(context)) return;
    const image = context.observe();
    const state = await context.oracle.snapshot();
    if (state.target) {
      await context.input.click(state.target.x, state.target.y, image?.id);
      return;
    }
    const target = state.objects?.find(object => object.id === state.requiredTargetId);
    if (target) await context.input.click(target.x, target.y, image?.id);
  }
}
