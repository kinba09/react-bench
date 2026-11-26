# ReactBench

A local benchmark for evaluating how accurately and quickly computer-use agents respond to dynamic graphical tasks in a controlled browser environment.

**Implemented:** Visual Reaction and Target Acquisition (five levels each), visible Dynamic Tracking (levels 1–3), and Inhibitory Control go/no-go (five levels), with seeded trials, a privileged Playwright oracle, browser-clock grading, independent screenshot capture, and local JSON/JSONL/HTML results. Other games and Codex/Claude integrations are tracked separately.

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
npm run benchmark -- --config configs/target-acquisition.json --seed experiment-a --output results/target-acquisition-experiment-a
npm run benchmark -- --config configs/dynamic-tracking.json --seed experiment-a --output results/dynamic-experiment-a
npm run benchmark -- --config configs/inhibitory-control.json --seed experiment-a --output results/inhibitory-experiment-a
npm run benchmark -- --headed
```

Choose a new output directory for each run; existing result files are never overwritten. Set `screenshotsPerSecond` in the JSON configuration to change observation frequency. The initial configuration has response windows of 5, 4, 3, 2, and 1 seconds and a seeded initial wait of 1–4 seconds. All durations are real elapsed time; CI does not freeze or accelerate the benchmark clock.

## Try the game

```sh
npm run dev
```

Open the printed local address, choose a game and level, and press **Start trial**. Visual Reaction asks you to click the target after it turns green. Target Acquisition asks you to match a reference shape among 6, 16, 36, 64, or 100 static objects. Every board uses a 26 CSS-pixel object diameter and a ten-second response limit. Dynamic Tracking asks you to click the moving star among 1, 5, or 15 objects; all objects use a 24-pixel radius and a constant 150-pixel-per-second speed. Inhibitory Control asks you to click the green cue once and withhold from the red cue until its 5, 4, 3, 2, or 1-second window ends. The first click ends an attempt; a forbidden or incorrect click fails. Practice is interactive and does not create an evaluated-agent report.

## Measurements and reproducibility

Standard evaluation uses a 1280 × 720 viewport, device scale 1, and two screenshots per second. Visual Reaction uses a constant 42-CSS-pixel target radius; Target Acquisition uses constant 26-CSS-pixel shapes across all crowding levels. Target Acquisition positions and the matching shape are generated from each trial's seed. In both acquisition and tracking, the reference is visible during preparation but the objects appear only after a seeded 1–4 second initial wait; the ten-second response window begins at activation. Dynamic Tracking computes moving ground truth at input registration, and its response latency starts at field activation. Screenshot capture runs independently of the adapter; only the newest image buffer is retained. Logs preserve achieved cadence and capture request/return times, with exact capture time unavailable.

Reaction latency is **browser software activation → browser click-handler registration**, measured with `performance.now()` in the same browser context. For Inhibitory Control, this latency is recorded only for a valid go response; correct withholding and other no-click trials have no reaction latency. Preparation, screenshot delivery, input submission/dispatch/return, and browser events retain their clock provenance. Browser and runner timestamps are not directly subtracted. Exact physical display onset, internal model processing, and unexposed decision-completion times are unavailable.

Each trial uses a fresh browser context and a newly created adapter. Input is one-shot and closes with the trial. Failed trials remain in correct/total counts; the median includes successful reactions only. P95 is unavailable in this initial slice and is displayed as **insufficient samples** for the initial profile. No composite score is produced.

Use the same seed, configuration, browser version, OS/hardware, viewport, and observation policy for comparisons. Seeds reproduce scenario parameters and order, not identical measured execution timing across runs or machines. The generated report records these settings, hardware metadata, benchmark/adapter and Playwright versions, the available Git commit, and whether tracked source changes were present. Git revision fields remain unknown when running a source archive without Git.

## Modules and validation

The task registry creates seeded scenarios; the browser environment emits ground-truth events; the adapter chooses actions; the runner owns lifecycle and observation capture; the deterministic grader consumes browser events; the reporter exports results. The visual adapter contract contains instructions, image retrieval, an abort signal, and coordinate input. Only privileged adapters receive the separate oracle capability. Local adapter code is trusted; this is not a sandbox for arbitrary third-party code.

```sh
npm run typecheck
npm run test:runner
npm test
```

Tests exercise real Chromium through the public runner-to-report boundary: default category profiles, premature/wrong/expired responses, one-attempt behavior, seeded replay, Target Acquisition crowding and deadline outcomes, Inhibitory Control action and withholding outcomes, configuration validation, and visual/oracle capability separation. GitHub Actions installs Chromium and runs the same credential-free checks.

## Design documents

- [Design specification](docs/design.md): six game categories, five difficulty levels, initial timing settings, scoring rules, and agent integration plans.
- [Domain glossary](GLOSSARY.md): agreed project terminology.

The broader MVP design covers 90 trials: six categories × five levels × three trials. Issues #2–#4 and #6 implement Visual Reaction, Target Acquisition, visible Dynamic Tracking, and the go/no-go Inhibitory Control slice. Inhibitory Control currently runs one go and one no-go trial per level; delayed-stop trials and the remaining categories are separate work. Hidden Dynamic Tracking levels 4–5 are also reserved for a separate ticket.

Planned integrations include Codex CLI, Claude Code, and custom API-backed, local, or existing computer-use agents. The privileged scripted oracle supports the current offline slice and remains separate from evaluated visual-agent results.

## License

Apache-2.0. See [LICENSE](LICENSE).
