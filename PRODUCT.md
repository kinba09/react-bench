# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Computer-use agent researchers and developers running local, reproducible evaluations.

## Product Purpose

Run timed benchmark games in a browser that computer-use agents operate with their own browser/computer tools. Measure registered actions and game outcomes while the environment continues advancing during observation, reasoning, and input.

## Operating Context

ReactBench serves and opens the browser task, presents instructions, schedules seeded trials, records browser events, and exports scores. Agents own observation and input, including screenshots taken through their own tools. The intended evaluation has no ReactBench screenshot feed, continuous capture, fixed screenshot rate, or required custom screenshot/action MCP bridge. Record actual browser/display settings, tool identity, and context-reset policy.

## Capabilities and Constraints

Visual Reaction, Target Acquisition, Dynamic Tracking, and Inhibitory Control each have five levels and support practice, privileged offline oracle runs, and scored browser sessions. Dynamic Tracking has 1, 5, 15, 30, and 60 moving objects. Levels 4 and 5 include Watch, Hidden, and Click phases. Default oracle profiles use three trials per level. Inhibitory Control runs one go, one no-go, and one delayed-stop trial per level. The default browser session offers three seeded Visual Reaction level-1 trials with readiness controls, cancellation, and JSON/JSONL/HTML exports. Agents use their own tools.

Remaining work includes Multi-Step Reaction, Temporal Decision-Making, client validation, and the full 90-trial profile. Schema 2 records game events and actual display metadata. Scoring is deterministic and timing uses browser software clocks. Correct withholding has null click latency and unavailable internal model timings remain unknown. Reports present the per-category outcomes and timings.

## Evidence on Hand

The glossary, design, MVP specification, implementation plan, game tests, and issues #1–#15 describe the benchmark. The #11 implementation is locally validated and awaits review. Genuine Codex and Claude runs remain unverified. See the [browser session guide](docs/browser-sessions.md) and [implementation plan](docs/plan.md).

## Product Principles

- Let agents use their own browser/computer tools; keep their observation and action loop outside ReactBench.
- Grade real task conditions and preserve failures.
- Distinguish measured software timing from physical display timing.
- Keep benchmark behavior independent of evaluated-agent reasoning.
- Keep setup and operation local and reproducible.
