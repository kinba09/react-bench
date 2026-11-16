import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { RunReport } from './types.js';

const require = createRequire(import.meta.url);
export const benchmarkVersion: string = require('../package.json').version;

export function benchmarkProvenance(): RunReport['benchmark'] {
  let gitCommit: string | null = null;
  let trackedChanges: boolean | null = null;
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  try {
    const options = { cwd, encoding: 'utf8' as const, timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'] };
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
    trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], options).trim().length > 0;
  } catch {
    // Source archives can run without Git. Unknown revision data stays explicit.
  }
  return { name: 'reactbench', version: benchmarkVersion, playwrightVersion: require('playwright/package.json').version,
    gitCommit, trackedChanges };
}
