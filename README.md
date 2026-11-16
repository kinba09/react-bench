# ReactBench

A local benchmark for evaluating how accurately and quickly computer-use agents respond to dynamic graphical tasks in a controlled browser environment.

**Implemented:** Visual Reaction, five levels, 15 seeded trials, a privileged Playwright oracle, browser-clock grading, independent screenshot capture, and local JSON/JSONL/HTML results. Other games and Codex/Claude integrations are tracked as separate tickets.

## Setup

Use Node.js 20.11 or newer. From the repository root:

```sh
npm ci
npm run browsers
```

Dependencies and Chromium require a download during initial setup. After setup, benchmark execution needs no network, model, API key, subscription, database, or cloud service.

## Run the offline control

```sh
npm run benchmark
```

This builds the project, starts a loopback-only game server, launches Chromium, and completes three trials at each level in seeded shuffled order. The default profile usually takes about a minute. Results are saved in a new timestamped directory under `results`:

- `results.json`: complete run configuration, environment/agent metadata, summaries, and trial evidence.
- `trials.jsonl`: one machine-readable record per trial.
- `report.html`: a self-contained report you can open locally.

The oracle reads privileged environment state and clicks through Playwright's mouse interface. Its results are labelled **control-only**, excluded from fair visual-agent comparisons, and do not describe visual model performance.

```sh
npm run benchmark -- --config configs/visual-reaction.json --seed experiment-a --output results/experiment-a
npm run benchmark -- --headed
```

Choose a new output directory for each run; existing result files are never overwritten. Set `screenshotsPerSecond` in the JSON configuration to change observation frequency. The initial configuration has response windows of 5, 4, 3, 2, and 1 seconds and a seeded initial wait of 1–4 seconds. All durations are real elapsed time; CI does not freeze or accelerate the benchmark clock.

## Try the game

```sh
npm run dev
```

Open the printed local address, select a level, and press **Start trial**. Wait while the target is red, then click the green target once. Clicking early or outside the target fails; leaving the response window without clicking expires the trial. Practice is interactive and does not create an evaluated-agent report.

## Measurements and reproducibility

Standard evaluation uses a 1280 × 720 viewport, device scale 1, a constant 42-CSS-pixel target radius, and two screenshots per second. Screenshot capture runs independently of the adapter; only the newest image buffer is retained. Logs preserve achieved cadence and capture request/return times, with exact capture time unavailable.

Reaction latency is **browser software activation → browser click-handler registration**, measured with `performance.now()` in the same browser context. Preparation, screenshot delivery, input submission/dispatch/return, and browser events retain their clock provenance. Browser and runner timestamps are not directly subtracted. Exact physical display onset, internal model processing, and unexposed decision-completion times are unavailable.

Each trial uses a fresh browser context and a newly created adapter. Input is one-shot and closes with the trial. Failed trials remain in correct/total counts; the median includes successful reactions only. P95 is unavailable in this initial slice and is displayed as **insufficient samples** for the initial profile. No composite score is produced.

Use the same seed, configuration, browser version, OS/hardware, viewport, and observation policy for comparisons. Seeds reproduce scenario parameters and order, not identical measured execution timing across runs or machines. The generated report records these settings, hardware metadata, benchmark/adapter and Playwright versions, the available Git commit, and whether tracked source changes were present. Git revision fields remain unknown when running a source archive without Git.

## Modules and validation

The task registry creates seeded scenarios; the browser environment emits ground-truth events; the adapter chooses actions; the runner owns lifecycle and observation capture; the deterministic grader consumes browser events; the reporter exports results. The visual adapter contract contains instructions, image retrieval, an abort signal, and coordinate input. Only privileged adapters receive the separate oracle capability. Local adapter code is trusted; this is not a sandbox for arbitrary third-party code.

```sh
npm run typecheck
npm run test:runner
npm test
```

Tests exercise real Chromium through the public runner-to-report boundary: the full default 15-trial control, premature/wrong/expired responses, one-attempt behavior, seed replay, configuration validation, and visual/oracle capability separation. GitHub Actions installs Chromium and runs the same credential-free checks.

## Design documents

- [Design specification](docs/design.md): six game categories, five difficulty levels, initial timing settings, scoring rules, and agent integration plans.
- [Domain glossary](GLOSSARY.md): agreed project terminology.

The broader MVP design covers 90 trials: six categories × five levels × three trials. This issue implements the first category only.

Planned integrations include Codex CLI, Claude Code, and custom API-backed, local, or existing computer-use agents. The privileged scripted oracle supports the current offline slice and remains separate from evaluated visual-agent results.

## License

Apache-2.0. See [LICENSE](LICENSE).
