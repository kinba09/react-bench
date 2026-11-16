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

The phase in which rules and reference targets are provided before the adapter signals readiness and the seeded initial wait begins. Game state and agent context reset between trials, and late responses remain attributed to their original trial and are discarded.

## Observation policy

The configured screenshot policy runs independently of agent reasoning, retains the newest available frame, and defaults to two captures per second with a 1280 × 720 viewport and device scale 1. Runs record the actual capture cadence achieved.

## Reaction latency

For a response to a task-defined stimulus, the elapsed browser-clock time from stimulus activation to action registration. This is software timing, with screenshot request and return times recorded separately and internal model-processing times unavailable unless exposed by the adapter.

_Avoid_: exact physical display latency, inferred internal model latency.

## Oracle baseline

A scripted control agent that may inspect privileged environment state and exercises the benchmark locally without a commercial model API. It is excluded from comparisons between evaluated visual agents.

_Avoid_: fair visual competitor, leaderboard agent.

## Agent adapter

The integration boundary that gives an evaluated agent task instructions and screenshots and maps its chosen mouse/keyboard actions to the benchmark browser without exposing hidden task state. Codex CLI and Claude Code use an MCP bridge, while API-backed, local, and existing computer-use agents can implement the same observation/action contract directly.

## Evaluated agent setup

The combination of model, client or reasoning loop, adapter, observation policy, and action interface measured in a run. Results identify that setup so model choices and tool overhead can be interpreted together.

_Avoid_: isolated model speed as a description of whole-agent results.
