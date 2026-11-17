import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultConfig, taskRegistry, validateConfig } from './registry.js';
import { runBenchmark } from './runner.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, output: { type: 'string' }, seed: { type: 'string' },
    headed: { type: 'boolean', default: false }, port: { type: 'string' }, help: { type: 'boolean' },
  } });
  const command = positionals[0];
  if (values.help || !command) {
    console.log('ReactBench\n\n  run [--config file.json] [--seed seed] [--output directory] [--headed]\n  serve [--port 4173]\n\nRun uses a privileged offline oracle, not an evaluated visual competitor.');
    return;
  }
  if (positionals.length !== 1) throw new Error('Provide one command: run or serve.');
  if (command === 'serve') {
    const port = Number(values.port ?? 4173);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be an integer from 0 to 65535.');
    const server = await startServer(port);
    console.log(`ReactBench practice: ${server.url}`);
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return;
  }
  if (command !== 'run') throw new Error(`Unknown command: ${command}`);
  const raw: unknown = values.config ? JSON.parse(await readFile(values.config, 'utf8')) : defaultConfig;
  const config = validateConfig(raw);
  if (values.seed !== undefined) config.seed = values.seed;
  const outputDir = resolve(values.output ?? `results/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  console.log(`Running ${taskRegistry[config.category].title} · privileged oracle control · 1280 × 720 · scale 1`);
  const report = await runBenchmark({ config, outputDir, headed: values.headed ?? false });
  console.log(`${report.summary.correct} / ${report.summary.total} correct\nSuccessful-response median: ${report.summary.medianReactionLatencyMs?.toFixed(1) ?? 'unavailable'} ms\nP95: insufficient samples\nResults: ${outputDir}`);
}
main().catch((error: unknown) => {
  console.error(`ReactBench: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
