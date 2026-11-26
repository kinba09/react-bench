# ReactBench

A local benchmark for evaluating how accurately and quickly computer-use agents respond to dynamic graphical tasks in a controlled browser environment.

## Intended evaluation flow

ReactBench runs the benchmark game in a browser. An evaluated agent opens or attaches to that browser using its own browser/computer tools, reads the on-page instructions, and plays. The agent owns observation and input, including any screenshots it chooses to take. ReactBench records game events, input registration, deadlines, outcomes, and scores; it does not supply screenshots, continuously capture frames, or require a custom screenshot/action bridge in the intended evaluation flow.

**Implementation status:** Visual Reaction, Target Acquisition, and Dynamic Tracking support scored browser sessions with agents' own tools. Sessions offer visible readiness between trials, cancellation, and JSON/JSONL/HTML exports. Inhibitory Control currently runs in practice or through the privileged offline oracle. Neither session nor oracle execution captures screenshots. Genuine Codex/Claude runs remain unvalidated.

See the [implementation plan](docs/plan.md) for priorities and parallel work.

**Implemented:** Visual Reaction, Target Acquisition, and Dynamic Tracking (five levels each), plus Inhibitory Control go/no-go (five levels), with seeded trials, a privileged Playwright oracle, browser-clock grading, and local JSON/JSONL/HTML results. Other games and Codex/Claude integrations are tracked separately.

## Setup

Use Node.js 20.11 or newer. From the repository root:

```sh
npm ci
npm run browsers
```

Dependencies and Chromium require a download during initial setup. After setup, benchmark execution needs no network, model, API key, subscription, database, or cloud service.

## Run a scored browser session

```sh
npm run session
```

This opens a local browser page with three seeded Visual Reaction trials at level 1. Let your agent operate that page with its own browser/computer tools. ReactBench supplies no screenshots or task-input tools. Read the rules and press **Start trial 1**. After each result, finish pending tool actions, choose **Prepare next trial**, then explicitly start the next trial. Preparing does not start its deadline.

Open the local address from the command, rather than `web/index.html` directly. The game needs its compiled JavaScript served by the local server; a `file://` page cannot run it.

```sh
npm run session -- --seed experiment-a --output results/session-a --agent my-agent --tool my-browser-tool
npm run session -- --no-open --port 0
npm run session -- --config configs/browser-session.json
npm run session -- --config configs/target-acquisition.json
npm run session -- --config configs/dynamic-tracking.json
```

The Target Acquisition example runs three seeded trials at each of five levels. The page shows the reference symbol during preparation, then reveals the board after the seeded wait. The agent has ten seconds to click the matching object. The first click ends the trial.

The Dynamic Tracking example runs three seeded trials at each of five levels. At levels 4 and 5, wait through Watch and Hidden, then click the star after it reappears. Earlier clicks end the trial as premature. Reports retain the browser phase events and measure successful reaction time from reappearance.

`--no-open` prints the URL for an agent that opens its own browser; `--port 0` selects an available port. Opening the page does not claim the session: the first participant to press Start claims it. Use that same tab for the rest of the run. Reloading during an active trial cannot restart or recover it; cancel and create a new session. The server stays available for report downloads until Ctrl+C. **Cancel session** saves an incomplete report containing finished trials only.

The page resets game state between trials; external tooling owns agent-context resets and pending-action cancellation. A native click does not identify its originating trial. Explicit preparation/start and a short inter-trial pause prevent automatic progression, but do not guarantee cancellation of arbitrarily delayed tool input. Stop pending actions before continuing. Local participants are trusted; browser-submitted event traces are regraded by the server, not tamper-proof against malicious local code.

Results are written to a new output directory and linked on the completed page. Report schema **2** removes required screenshot observations/cadence, records actual per-trial display settings, and leaves external tool dispatch/model timings unavailable. Older configurations must remove `screenshotsPerSecond`; unknown options are rejected.

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

Choose a new output directory for each run; existing result files are never overwritten. The initial configuration has response windows of 5, 4, 3, 2, and 1 seconds and a seeded initial wait of 1–4 seconds. All durations are real elapsed time; CI does not freeze or accelerate the benchmark clock.

## Try the game

```sh
npm run dev
```

Open the printed local address, choose a game and level, and press **Start trial**. Visual Reaction asks you to click the target after it turns green. Target Acquisition asks you to match a reference shape among 6, 16, 36, 64, or 100 static objects. Every board uses a 26 CSS-pixel object diameter and a ten-second response limit. The first click ends the attempt: a wrong choice fails and cannot be rescued by another click. Dynamic Tracking asks you to click the moving star among 1, 5, 15, 30, or 60 objects; all objects use a 24-pixel radius and a constant 150-pixel-per-second speed. Levels 4 and 5 add a 1.5-second Watch phase and a 1- or 2-second Hidden phase; the ten-second click window starts when the target reappears. Inhibitory Control asks you to click the green cue once and withhold from the red cue until its 5, 4, 3, 2, or 1-second window ends. Practice is interactive and does not create an evaluated-agent report.

## Measurements and reproducibility

The current offline runner uses a 1280 × 720 viewport and device scale 1. Browser sessions record actual per-trial browser/display settings and the declared agent tool setup; ReactBench does not prescribe screenshot cadence. Visual Reaction uses a constant 42-CSS-pixel target radius; Target Acquisition uses constant 26-CSS-pixel shapes across all crowding levels. Target Acquisition positions and the matching shape are generated from each trial's seed. Target Acquisition and Dynamic Tracking levels 1–3 show the reference during preparation, then reveal objects after a seeded 1–4 second initial wait. Dynamic Tracking levels 4–5 show moving objects during the 1.5-second Watch phase, hide the field for the level-specific interval, then start the ten-second click window on reappearance. Moving ground truth is computed at input registration; successful response latency also starts at reappearance. Agents own observation; no benchmark screenshot sampler remains. Browser-session actions are recorded by the game event handler, with no invented runner dispatch or model timing.

Reaction latency is **browser software activation → browser click-handler registration**, measured with `performance.now()` in the same browser context. For Inhibitory Control, this latency is recorded only for a valid go response; correct withholding and other no-click trials have no reaction latency. The offline runner records preparation and input dispatch on its own clock. Browser sessions record preparation and task input on the browser clock; external tool timings are unavailable unless supplied by separate tooling. Browser and runner timestamps are not directly subtracted. Exact physical display onset, internal model processing, and unexposed decision-completion times are unavailable.

The current offline runner uses a fresh browser context and a newly created adapter per trial. Browser sessions reset game state per trial and record the agent-context reset policy without claiming that the page can reset an external agent. Input is one-shot and closes with the trial. Failed trials remain in correct/total counts; the median includes successful reactions only. P95 is unavailable in this initial slice and is displayed as **insufficient samples** for the initial profile. No composite score is produced.

Use matched seeds, game configuration, browser/display settings, and declared agent tool/context policies for controlled comparisons. Different tool setups must be labelled separately; a common ReactBench screenshot rate is not required. Seeds reproduce scenario parameters and order, not identical measured execution timing across runs or machines. The generated report records these settings, hardware metadata, benchmark/adapter and Playwright versions, the available Git commit, and whether tracked source changes were present. Git revision fields remain unknown when running a source archive without Git.

## Modules and validation

The task registry creates seeded scenarios; the browser environment emits ground-truth events; the deterministic grader consumes browser events; the reporter exports results. The offline runner invokes privileged oracle or internal test fixtures. The browser session controller owns trial scheduling, readiness, event collection, and exports while external agents use their own tools. The [design](docs/design.md) and [plan](docs/plan.md) describe the remaining work; local trusted code is not a sandbox for arbitrary third-party agents.

```sh
npm run typecheck
npm run test:runner
npm test
```

Tests exercise real Chromium through the public runner-to-report boundary: default category profiles, premature/wrong/expired responses, one-attempt behavior, seeded replay, Target Acquisition crowding and deadline outcomes, Inhibitory Control action and withholding outcomes, configuration validation, and oracle capability separation. Browser-session tests cover native input, readiness, terminal-state isolation, cancellation, retry after export failure, and scoring with screenshot capture disabled. GitHub Actions installs Chromium and runs the same credential-free checks.

## Design documents

- [Implementation plan](docs/plan.md): browser-session migration, priorities, dependencies, and parallel work.
- [MVP specification](docs/spec.md): scope, requirements, and behavioral validation.
- [Design specification](docs/design.md): six game categories, five difficulty levels, initial timing settings, scoring rules, and agent integration plans.
- [Domain glossary](GLOSSARY.md): agreed project terminology.

The broader MVP design covers 90 trials: six categories × five levels × three trials. Issues #2–#5 implement Visual Reaction, Target Acquisition, and all five Dynamic Tracking levels. Issue #6 adds Inhibitory Control go/no-go, currently one go and one no-go trial per level; delayed-stop trials and the remaining categories are separate work.

Planned integrations let Codex CLI, Claude Code, and custom API-backed, local, or existing computer-use agents operate the benchmark browser with their own tools. Optional launch helpers manage setup and lifecycle; ReactBench does not provide their screenshot or action tools. The privileged scripted oracle supports the current offline slice and remains separate from evaluated visual-agent results.

## License

Apache-2.0. See [LICENSE](LICENSE).
