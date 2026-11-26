# ReactBench glossary

This glossary records agreed terminology. Detailed game rules, initial timing settings, and run protocol are recorded in [the design notes](docs/design.md).

## ReactBench

A benchmark of the complete perception, decision, and action loop of computer-use agents in controlled, dynamic browser games. The initial environment runs in Chromium and continues advancing while an agent observes, reasons, and acts.

## Benchmark game

A controlled graphical task used to evaluate an agent under explicit task conditions and time constraints. Each game belongs to one of the six benchmark categories and supports five difficulty levels.

_Avoid_: general-purpose browser workflow.

## Difficulty level

One of five numbered levels, 1 through 5, with increasing challenge within a category. The agreed progression axes and object or sequence counts are recorded in [the design notes](docs/design.md).

_Avoid_: easy/medium/hard as a separate three-level scheme.

## Visual Reaction

The category in which an agent clicks when a red target becomes green.

## Target Acquisition

The category in which an agent clicks exactly one correct target at a randomized position among distractors, identified by a visible reference. Levels 1 through 5 contain 6, 16, 36, 64, and 100 total objects, respectively.

## Dynamic Tracking

The category in which an agent clicks the required moving target among 1, 5, 15, 30, or 60 total moving objects across levels 1 through 5, with each click graded as a hit or a miss. Levels 4 and 5 temporarily hide the target; a visible remaining-time countdown indicates that the trial is active, and the agent waits for reappearance before clicking.

_Avoid_: pointer-to-center distance as a performance metric, continuous pointer tracking as a task requirement.

## Inhibitory Control

The category containing separately reported go/no-go and delayed-stop trial variants, with one go, one no-go, and one delayed-stop trial at each level in the initial run and seeded stop-delay variation of ±20% around the level's nominal value. Go/no-go requires responding to green and withholding on red; a delayed-stop trial succeeds only if no click registers during its response window, with pre-stop and post-stop responses reported separately as failed stops.

## Multi-Step Reaction

The category in which signals appear one at a time and require corresponding actions before individual step deadlines. Results include whole-sequence accuracy and per-step response delay.

## Temporal Decision-Making

The category in which a visible progress indicator announces an approaching activation window, and the agent aims to click at its center. Clicks outside the window fail, and timing error is measured relative to the window's center.

## Trial

One scored attempt at a category's game; a Multi-Step Reaction trial contains its entire cue sequence. The initial run contains three trials per category per level, for 90 trials in total, with one click attempt per target or cue and no recovery from an incorrect or premature click.

## Trial preparation

The phase in which the browser shows rules and reference targets before a visible readiness/start action begins the seeded initial wait. Game state resets between trials. An external launcher or operator manages agent-context resets and records that policy. Session transitions must prevent delayed input from a completed trial from scoring against the next one.

## Observation policy

The declared way an agent observes the browser using its own tools. ReactBench does not provide images, capture continuously, or set a screenshot rate in the intended evaluation flow. Record tool identity and browser/display settings; any exposed observation timings are optional and unknown values remain unavailable. The screenshot sampler has been removed; schema 1 observation fields are historical only.

## Reaction latency

For a response to a task-defined stimulus, the elapsed browser-clock time from stimulus activation to action registration. This is software timing. Agent-tool timings are optional when exposed by the agent's own tools; internal model-processing times remain unavailable unless explicitly exposed.

_Avoid_: exact physical display latency, inferred internal model latency.

## Oracle baseline

A scripted control agent that may inspect privileged environment state and exercises the benchmark locally without a commercial model API. It is excluded from comparisons between evaluated visual agents.

_Avoid_: fair visual competitor, leaderboard agent.

## Agent adapter

An optional launcher/lifecycle integration that points an agent at the benchmark browser or session URL and records setup metadata. The agent uses its own observation and input tools. ReactBench does not require a shared screenshot/action adapter or custom MCP bridge. Internal input fixtures and the privileged oracle remain available for tests and offline controls; external browser sessions require no adapter.

## Evaluated agent setup

The combination of model, client or reasoning loop, browser/computer tools, optional launcher, observation policy, and context-reset policy measured in a run. Results identify that setup so model choices and tool overhead can be interpreted together.

_Avoid_: isolated model speed as a description of whole-agent results.

## Browser evaluation session

A scored run of seeded trials in a browser, with on-page instructions, readiness, trial progression, event collection, completion, and result export. The agent operates the page through its own tools. Visual Reaction and Target Acquisition implement this flow.

## Session controller

The benchmark component responsible for scheduling trials, readiness, deadlines, trial identity, event collection, cancellation, and exports. It does not supply an external agent's observations or dispatch that agent's task actions. The offline oracle runner separately dispatches its own control inputs; it captures no screenshots.
