import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultConfig, taskRegistry, validateConfig } from './registry.js';
import { runBenchmark } from './runner.js';
import { startServer } from './server.js';
import { startBrowserSession } from './session.js';
import { execFile } from 'node:child_process';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, output: { type: 'string' }, seed: { type: 'string' },
    headed: { type: 'boolean', default: false }, port: { type: 'string' }, help: { type: 'boolean' },
    'no-open': { type: 'boolean', default: false }, agent: { type: 'string' }, model: { type: 'string' }, tool: { type: 'string' },
  } });
  const command = positionals[0];
  if (values.help || !command) {
    console.log('ReactBench\n\n  session [--config file.json] [--seed seed] [--output directory] [--port 4173] [--no-open] [--agent name] [--model name] [--tool name]\n  run [--config file.json] [--seed seed] [--output directory] [--headed]\n  serve [--port 4173]\n\nSession opens a scored browser task for an agent using its own tools. Run uses a privileged offline oracle. Neither mode captures screenshots.');
    return;
  }
  if (positionals.length !== 1) throw new Error('Provide one command: session, run, or serve.');
  if (command === 'serve') {
    const port = Number(values.port ?? 4173);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be an integer from 0 to 65535.');
    const server = await startServer(port);
    console.log(`ReactBench practice: ${server.url}`);
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return;
  }
  if (command !== 'run' && command !== 'session') throw new Error(`Unknown command: ${command}`);
  const raw: unknown = values.config ? JSON.parse(await readFile(values.config, 'utf8'))
    : command === 'session' ? { ...defaultConfig, levels: [1], trialsPerLevel: 3 } : defaultConfig;
  const config = validateConfig(raw);
  if (values.seed !== undefined) config.seed = values.seed;
  const outputDir = resolve(values.output ?? `results/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (command === 'session') {
    if (config.category !== 'visual-reaction') throw new Error('Browser sessions currently support Visual Reaction only.');
    const port = Number(values.port ?? 4173);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be an integer from 0 to 65535.');
    const session = await startBrowserSession({ config, outputDir, port,
      agent: { name: values.agent ?? 'external-browser-agent', model: values.model ?? null, access: 'visual',
        tool: values.tool ?? 'unspecified', contextPolicy: 'Managed by the external agent/operator; not reset by ReactBench.' } });
    console.log(`ReactBench scored browser session: ${session.url}\n${config.trialsPerLevel} trials per level · agent uses its own tools · no screenshot capture\nResults: ${outputDir}`);
    const stop = () => { void session.cancel().then(() => session.close()).then(() => process.exit(0)).catch(error => {
      console.error(`Could not save partial results: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      void session.close();
    }); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    if (!values['no-open']) {
      const executable = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', session.url] : [session.url];
      execFile(executable, args, error => { if (error) console.log(`Open the session URL in your agent's browser: ${session.url}`); });
    }
    const report = await session.finished;
    console.log(`${report.status}: ${report.summary.correct} / ${report.trials.length} recorded trials correct.\nResults: ${outputDir}\nThe session remains available for downloads. Press Ctrl+C to stop.`);
    return;
  }
  console.log(`Running ${taskRegistry[config.category].title} · privileged oracle control · 1280 × 720 · scale 1`);
  const report = await runBenchmark({ config, outputDir, headed: values.headed ?? false });
  console.log(`${report.summary.correct} / ${report.summary.total} correct\nSuccessful-response median: ${report.summary.medianReactionLatencyMs?.toFixed(1) ?? 'unavailable'} ms\nP95: insufficient samples\nResults: ${outputDir}`);
}
main().catch((error: unknown) => {
  console.error(`ReactBench: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
