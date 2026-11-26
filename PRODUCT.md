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

Implemented: five levels each of Visual Reaction, Target Acquisition, Dynamic Tracking, and Inhibitory Control. Dynamic Tracking has 1, 5, 15, 30, and 60 moving objects; levels 4–5 include Watch, Hidden, and Click phases. Default oracle profiles use three trials per level. Inhibitory Control uses one go, one no-go, and one delayed-stop trial at each level. Browser practice, privileged offline oracle reports, and scored browser sessions for Visual Reaction, Target Acquisition, and Dynamic Tracking work today. The default browser session has three seeded Visual Reaction level-1 trials with explicit readiness, cancellation, and JSON/JSONL/HTML exports; agents use their own tools.

Planned: extend scored browser sessions to the other games, finish Multi-Step Reaction, Temporal Decision-Making, client validation, and the full 90-trial profile. Continuous capture and screenshot configuration have been removed from both session and oracle execution. Schema 2 records game events and actual display metadata without required observation telemetry. Correct withholding has no invented click latency. Scoring is deterministic, timing is software timing with clock provenance, unavailable internal model timings remain unavailable, and no composite score is produced.

## Evidence on Hand

The glossary, design, MVP specification, implementation plan, implemented game tests, and issues #1–#15. PR #19 is merged. No genuine external-agent evaluation has been validated. See [the plan](docs/plan.md).

## Product Principles

- Let agents use their own browser/computer tools; keep their observation and action loop outside ReactBench.
- Grade real task conditions and preserve failures.
- Distinguish measured software timing from physical display timing.
- Keep benchmark behavior independent of evaluated-agent reasoning.
- Keep setup and operation local and reproducible.
