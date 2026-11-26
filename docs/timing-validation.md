# Native browser timing validation

ReactBench serves the task while the participant owns observation and input. The game continues on the browser clock while an external tool observes, waits, reasons, dispatches input, or returns from a call. This document maps [issue #10](https://github.com/kinba09/react-bench/issues/10) to its implementation and behavioral evidence.

## What the tests measure

The [native timing suite](../tests/session-timing.test.mjs) starts scored sessions, operates visible controls and a native Chromium mouse, and inspects JSON, JSONL, and offline HTML exports. It uses actual elapsed time: there is no mocked clock, paused page, benchmark screenshot call, image feed, or model subscription. Seeded coordinates and a single moving-star pixel read are scripted-fixture inputs, not a claim of visual-model performance.

The same seeded Visual Reaction profile runs at 1280 × 720 / scale 1 and 390 × 844 / scale 2. Each run covers:

- Preparation lasting at least 200 ms without consuming the response window.
- A successful response after separate observation, decision, and dispatch delays.
- An observation arriving after the browser has already recorded expiry, followed by an ineffective stale click.
- A decision that finishes after the response deadline, followed by an ineffective late click.
- A native mouse call held in flight across expiry. The session completes before that call returns; its eventual release cannot rescue the trial.

Each profile has a 100 ms configured wait and a 1200 ms response window. Slow observations wait 1900 ms; delayed decisions and held mouse calls wait 1600 ms after observing activation. These margins separate intended outcomes from ordinary scheduling jitter. Assertions use actual recorded onset and deadline events, rather than requiring exact wall-clock durations. The preparation, successful-response latency, and expiry checks all use their browser timestamps.

A separate moving-target case observes the visible star once, waits, then clicks the stale location. The exported click-time object positions must explain the miss. This verifies that delayed input is graded against the moving field when it registers.

Two scrolling cases cover Visual Reaction and Inhibitory Control. They move the viewport between cue observation and click registration and verify a correct visible click still succeeds. Circle hit testing now resolves the current canvas position at registration; the prior cached viewport coordinates could grade a correct click as wrong.

## Cancellation and trial transitions

A pending external call is deliberately allowed to arrive after **Cancel session**. The cancelled session retains its finished trial, excludes the unfinished trial, and preserves all three exported files. Identical completion retries stay idempotent; conflicting results, new completions, Start, and Prepare requests cannot reopen or rescore the cancelled session.

The [session suite](../tests/session.test.mjs) covers completed-trial closure, stale trial IDs, explicit acknowledgement that pending actions have finished, clicks during preparation, and gestures whose press began before the running trial. The [handoff regression](../tests/session-handoff.test.mjs) verifies that session controls stay locked during a pending transition.

These checks validate the actual policy. A native event has no originating-trial ID. A whole new gesture arriving after the next Start cannot be attributed to an earlier tool call. ReactBench does not cancel an external tool or reset its context. The operator or launcher must drain or cancel pending actions before checking the readiness acknowledgement, and record the chosen context policy. The cancellation test drains its pending call before cleanup.

## Clock and evidence contract

| Evidence | Clock or availability |
| --- | --- |
| Browser preparation, Start, activation, phase changes, stop signals, clicks, expiry | `performance.now()` in the trial page, labelled `browser-performance`. |
| Browser-session preparation duration | `started.atMs - prepared.atMs`, separate from the response window. |
| Successful reaction latency | Click registration minus actual activation in that same browser clock. Dynamic Tracking occlusion starts this clock at reappearance. |
| Browser clock identity | `timing.browserTimeOriginMs`, from the trial page's `performance.timeOrigin`. |
| Offline oracle preparation and dispatch records | `runner-performance`; recorded separately from browser reaction latency. |
| Native-tool dispatch/observation timing and internal model processing | Unavailable in required session records. The native `actions` list is empty and `modelProcessingMs` is null. |
| Viewport, device scale, browser identity | Browser-reported settings at trial Start, retained per trial. Browser user-agent identity is self-reported; runner CPU/OS identify the server host. |

No browser/runner clock subtraction is used to derive reaction latency. Browser software onset is not a physical display-onset measurement. Optional external logs may accompany a run, but must identify their source, clock domain, and uncertainty. Their absence never prevents scoring or exports. A configured sleep in a scripted fixture is not an internal model-processing measurement.

The two display-profile runs must reproduce the configured seeded scenarios and deterministic grades while retaining their actual profile metadata. They do not claim identical response durations. Display settings identify distinct evaluated setups, rather than proving that results from different profiles are directly comparable.

## Schema migration and historical results

Current reports use schema 2. Configuration, result types, sessions, and the offline oracle no longer require screenshot observations, capture rate, a newest-frame buffer, or an image/action bridge. Configuration validation rejects the removed `screenshotsPerSecond` option. Browser-session input comes through native tools; the offline runner's input fixture/oracle interfaces are not prerequisites for an external agent.

Reports from the earlier sampler implementation are historical schema-1 evidence. Keep their original schema version, configuration, sampler fields, and measurement labels; do not relabel them as native browser-session results or fabricate missing tool observations during conversion. The current reporter writes schema 2 and provides no schema-1 import/conversion path. Comparisons or import support remain separate report work in #14. Removing the old option is required for a new configuration, not permission to rewrite old result data.

## Issue #10 acceptance evidence

| Criterion | Implementation and tests |
| --- | --- |
| Remove continuous capture from sessions and the oracle | Session execution serves the page without a capture API. `offline oracle completes with screenshot capture disabled` in the [session suite](../tests/session.test.mjs) verifies the credential-free oracle path. |
| Migrate configuration and result types | [Shared schema-2 types](../src/types.ts), [configuration validation](../src/registry.ts), and [contract tests](../tests/contracts.test.mjs) remove required observations and reject the old capture option. Historical distinctions are documented above. |
| Validate delayed observations, decisions, and native input | Both display profiles and the stale moving-target case in the [timing suite](../tests/session-timing.test.mjs) verify real-time progression, missed deadlines, and registration-time scoring. |
| Record software events and one-clock reaction latency | Each timing-suite trial checks prepared/started events, trial identity, browser clock labels, exact latency derivation, deadline semantics, and exports. Existing game suites cover stop and occlusion phase events. |
| Keep optional telemetry honest | Timing tests verify null model-processing time, empty native dispatch logs, and no fabricated screenshot records. Export generation succeeds without external logs. |
| Reset state and isolate closed trials | The timing cancellation case, session readiness/gesture tests, and pending-transition regression cover native input, reset policy metadata, closed exports, retries, and no rescoring. |
| State late-input attribution and cancellation limits | The lifecycle policy above and the [session guide](browser-sessions.md) describe what the page can enforce and what external tooling must manage. |
| Reproduce seeds, grades, metadata, and exports | Timing tests compare the seeded plan and common grader with recorded results, assert actual display settings and agent policy, and check all three export formats. Existing session and runner suites preserve oracle separation. |
| Preserve a credential-free, capture-free oracle | The full suite retains the offline oracle and its capture-disabled test; no paid model access is used. |

Run the focused checks after building:

```sh
npm run build
node --test --test-concurrency=1 tests/session-timing.test.mjs tests/session-handoff.test.mjs
npm run typecheck
npm test
```

Validated on 2026-11-26: `npm test` passed all 64 tests with zero failures, including all six new timing cases and the existing oracle/session/game checks. `npm run typecheck`, local documentation links, and `git diff --check` also passed. These are scripted-fixture results, not genuine model-performance evidence.
