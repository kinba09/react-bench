# ReactBench implementation plan

## Direction

ReactBench opens or serves a benchmark game in a browser. Agents work on that page through their own browser/computer tools. ReactBench owns rules, seeded scheduling, deadlines, browser-registered events, deterministic grading, and exports. Agents own observation and task input. Remove the benchmark-owned screenshot feed, continuous sampler requirement, fixed screenshot cadence, and mandatory screenshot/action MCP bridge from external-agent evaluation.

Visual Reaction and Target Acquisition support scored browser sessions with explicit preparation and start controls, native-tool input, cancellation, and result exports. Continuous screenshot capture has been removed from both sessions and the separately labelled offline oracle.

## First slice delivered

- `npm run session` opens the scored page; `--no-open` supports agents that open their own browser.
- Three seeded Visual Reaction trials at level 1 by default. Browser-event clocks drive scoring; agent input bypasses internal adapters.
- Target Acquisition sessions use the existing five levels and seeded boards. The report records each level's object count, outcomes, and reaction latency for successful picks.
- The participant claims the session on Start. Preparation, active trial, completion, and cancellation have distinct behavior. Inter-trial preparation does not start deadlines.
- Completed traces are submitted once, retries are idempotent, and export failures offer Retry. Cancellation writes an explicitly incomplete report.
- Schema 2 removes required screenshots/capture cadence. Actual per-trial display settings are exported; native-tool dispatch/model timing is not invented.
- Credential-free Chromium tests cover native-input success/failures, readiness/isolation, participant ownership, cancellation, export retry, and the oracle with capture disabled.

## Next priorities

1. **Extend browser evaluation sessions — [#11](https://github.com/kinba09/react-bench/issues/11).** Add Dynamic Tracking and Inhibitory Control to scored browser sessions, including their phase transitions and outcome evidence. Verify readiness, cancellation, and exports through agents' own browser tools.
2. **Runtime migration and timing validation — [#10](https://github.com/kinba09/react-bench/issues/10).** Capture and screenshot configuration removal are delivered. Expand slow-agent, cancellation, display-profile, and lifecycle validation around the native session path; preserve honest timing and historical report distinctions. Validate real-time deadlines, slow participants, trial transitions, and clock provenance. Preserve the offline oracle and clearly distinguish any historical sampler fields.
3. **Complete game coverage — [#7](https://github.com/kinba09/react-bench/issues/7), [#8](https://github.com/kinba09/react-bench/issues/8), [#9](https://github.com/kinba09/react-bench/issues/9).** Finish delayed-stop, Multi-Step Reaction, and Temporal Decision-Making with the agreed rules and browser-event metrics. Integrate with sessions without introducing image delivery or external-action routing.
4. **Validate real clients — [#12](https://github.com/kinba09/react-bench/issues/12) and [#13](https://github.com/kinba09/react-bench/issues/13).** Demonstrate Codex CLI and Claude Code playing through their own browser/computer tools. Document supported connection, authentication, reset, and cancellation setup. Claim support only after genuine evidence; missing tools/access must be reported explicitly.
5. **Reports and complete profile — [#14](https://github.com/kinba09/react-bench/issues/14), [#15](https://github.com/kinba09/react-bench/issues/15).** Compare labelled complete agent setups, keep unknown tool timings unavailable, and validate six categories × five levels × three trials. Preserve the credential-free oracle profile and add browser-session export coverage.

PR #19 is merged; waiting on it is no longer a dependency.

## Parallel work and dependencies

Agree on the session/trial lifecycle and event/result schema before concurrent implementations. Share session/trial IDs, readiness/start/complete/cancel states, browser event clocks, export shape, and metadata for the external tool setup. No observation buffer or screenshot rate belongs in the required session contract.

- **Session work (#11)** owns browser access, participant controls, trial progression, event collection, and export integration.
- **Migration/validation work (#10)** can proceed alongside #11 once that contract is agreed. Coordinate changes to runner/types and existing tests; assign ownership of shared edits rather than independently redesigning interfaces.
- **Game work (#7, then #8/#9)** can proceed alongside sessions. Game changes own scenarios, rendering, events, and grading. Coordinate shared type and report changes; separate branches/worktrees do not eliminate merge conflicts.
- **Codex and Claude work (#12/#13)** can proceed in parallel after the session path works and #10 validates the lifecycle. Setup research can happen earlier, but no screenshot/action bridge should be built as a prerequisite.
- **Reports (#14)** can use agreed event/result fixtures while sessions and categories are implemented. The complete integration check (#15) follows all six games and the session/export work; genuine paid-client access is not a prerequisite for offline validation.

## Required acceptance evidence

- A scripted browser participant can finish a seeded scored session and export results with no ReactBench screenshot calls, image feed, or image/action adapter.
- Slow observation/reasoning never pauses the game. Missed windows and incorrect actions remain failures.
- Browser activation and input registration use the same clock. External tool/model timings are optional and labelled by source and availability.
- Completed/cancelled trials cannot be rescored. Explicit inter-trial readiness/quiescence is tested so pending external input cannot silently become a new-trial action. Native input lacks an originating trial ID; document tool-specific cancellation and attribution limits.
- Fresh agent context is an external launcher/operator policy and is reported honestly. The page does not claim to reset arbitrary agent memory.
- Hidden ground truth and future scenarios are not participant controls. Visual-task rules and privileged-oracle separation remain in force.
- Oracle and external-agent runs are labelled separately; matched game/browser profiles and declared tool/context policies govern comparisons. Missing tool telemetry never prevents game-event scoring.

## Scope of this update

The Visual Reaction and Target Acquisition browser sessions and capture removal are implemented. Dynamic Tracking and Inhibitory Control sessions, broader slow-agent validation, and client examples remain in #10/#11. Active-trial page reload cannot recover its unfinished trace; cancel and start a new run. Genuine Codex and Claude runs and the full 90-trial profile remain follow-up work.
