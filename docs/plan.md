# ReactBench implementation plan

## Direction

ReactBench opens or serves a benchmark game in a browser. Agents work on that page through their own browser/computer tools. ReactBench owns rules, seeded scheduling, deadlines, browser-registered events, deterministic grading, and exports. Agents own observation and task input. Remove the benchmark-owned screenshot feed, continuous sampler requirement, fixed screenshot cadence, and mandatory screenshot/action MCP bridge from external-agent evaluation.

Visual Reaction, Target Acquisition, Dynamic Tracking, and Inhibitory Control support scored browser sessions with explicit preparation and start controls, native-tool input, cancellation, and result exports. The [browser session guide](browser-sessions.md) includes the [#11](https://github.com/kinba09/react-bench/issues/11) acceptance evidence for review. Continuous screenshot capture has been removed from both sessions and the separately labelled offline oracle.

## Scored sessions delivered

- `npm run session` opens the scored page; `--no-open` supports agents that open their own browser.
- Three seeded Visual Reaction trials at level 1 by default. Browser-event clocks drive scoring; agent input bypasses internal adapters.
- Target Acquisition sessions use the existing five levels and seeded boards. The report records each level's object count, outcomes, and reaction latency for successful picks.
- Dynamic Tracking sessions use all five levels. At levels 4 and 5, the report records Watch, Hidden, and Click phases and measures reaction latency from reappearance.
- Inhibitory Control sessions report go responses, no-go withholding, and delayed-stop outcomes, including clicks before or after the stop signal.
- The participant claims the session on Start. Before preparing the next trial, the participant confirms that pending tool actions have finished. The clock for that trial waits for Start.
- Completed traces are submitted once, retries are idempotent, and export failures offer Retry. Cancellation writes an explicitly incomplete report.
- Schema 2 removes required screenshots/capture cadence. Actual per-trial display settings are exported; native-tool dispatch/model timing is not invented.
- Credential-free Chromium tests cover native-input success/failures, readiness/isolation, participant ownership, cancellation, export retry, and the oracle with capture disabled.

## Next priorities

1. **Runtime migration and timing validation — [#10](https://github.com/kinba09/react-bench/issues/10).** Capture and screenshot configuration removal are delivered. Expand slow-agent, cancellation, display-profile, and lifecycle validation around the native session path. Preserve honest timing, the offline oracle, and historical report distinctions.
2. **Complete game coverage — [#8](https://github.com/kinba09/react-bench/issues/8) and [#9](https://github.com/kinba09/react-bench/issues/9).** Add Multi-Step Reaction and Temporal Decision-Making with their browser-event metrics. Delayed-stop [#7](https://github.com/kinba09/react-bench/issues/7) works in scored sessions, practice, and the offline oracle.
3. **Validate real clients — [#12](https://github.com/kinba09/react-bench/issues/12) and [#13](https://github.com/kinba09/react-bench/issues/13).** Demonstrate Codex CLI and Claude Code playing through their own browser/computer tools. Document supported connection, authentication, reset, and cancellation setup. Record evidence from actual client runs before claiming support.

   The local Codex CLI smoke attempt authenticated and reached its configured tools, but browser transport and native-app permissions failed before Start. See [the recorded evidence and repeat procedure](codex-cli-smoke.md).
4. **Reports and complete profile — [#14](https://github.com/kinba09/react-bench/issues/14), [#15](https://github.com/kinba09/react-bench/issues/15).** Compare labelled complete agent setups, keep unknown tool timings unavailable, and validate six categories × five levels × three trials. Preserve the credential-free oracle profile and add browser-session export coverage.

## Parallel work and dependencies

Agree on the session/trial lifecycle and event/result schema before concurrent implementations. Share session/trial IDs, readiness/start/complete/cancel states, browser event clocks, export shape, and metadata for the external tool setup. No observation buffer or screenshot rate belongs in the required session contract.

- **Migration and validation work (#10)** builds on the session contract in #11. Coordinate changes to the runner, types, and shared tests.
- **Game work (#8/#9)** can proceed alongside timing validation. Game changes own scenarios, rendering, events, and grading. Coordinate shared type and report changes between branches.
- **Codex and Claude work (#12/#13)** can proceed in parallel through their existing browser tools. Genuine client runs require working access to the local browser and session URL.
- **Reports (#14)** can use agreed event/result fixtures while sessions and categories are implemented. The complete integration check (#15) follows all six games and the session/export work; genuine paid-client access is not a prerequisite for offline validation.

## Required acceptance evidence

- A scripted browser participant can finish a seeded scored session and export results with no ReactBench screenshot calls, image feed, or image/action adapter.
- Slow observation/reasoning never pauses the game. Missed windows and incorrect actions remain failures.
- Browser activation and input registration use the same clock. External tool/model timings are optional and labelled by source and availability.
- Completed or cancelled trials cannot be rescored. The inter-trial pause, acknowledgement, and explicit Start keep scoring closed until the next trial begins. Native input lacks an originating trial ID, so external tools must settle or cancel pending input before the next trial.
- Fresh agent context is an external launcher/operator policy and is reported honestly. The page does not claim to reset arbitrary agent memory.
- Hidden ground truth and future scenarios are not participant controls. Visual-task rules and privileged-oracle separation remain in force.
- Oracle and external-agent runs are labelled separately; matched game/browser profiles and declared tool/context policies govern comparisons. Missing tool telemetry never prevents game-event scoring.

## Scope of this update

Issue #11 is implemented and pending review. Broader slow-agent validation remains in #10. Active-trial page reload cannot recover its unfinished trace, so cancel and start a new run. Genuine Codex and Claude runs and the full 90-trial profile remain follow-up work.
