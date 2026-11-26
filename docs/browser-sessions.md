# Scored browser sessions

ReactBench runs the task and records browser events. The agent uses its existing browser or computer tools to observe the page and click. Scored sessions support Visual Reaction, Target Acquisition, Dynamic Tracking, and Inhibitory Control, including go, no-go, and delayed-stop trials.

## Run an agent with its own tools

From the repository root, start a short Visual Reaction run. Replace the example labels with the actual agent, model, client, tool, and context policy. Choose a new output directory for each run.

```sh
npm run session -- --config configs/browser-session.json --seed session-a \
  --output results/session-a --no-open --port 0 \
  --agent 'evaluation-agent-a' --model 'model-and-version' \
  --client 'local-agent-client version' --tool 'browser tool version' \
  --context-policy 'One agent context for the entire session'
```

`--no-open` prints an address such as `http://127.0.0.1:49152/session/<session-id>`. Give the actual printed URL to an existing agent with visual browser access and native pointer input. Its browser must be able to reach the host's loopback listener. Omit `--no-open` to open the local default browser, then attach the agent to that tab through its own tooling.

For example, start a task in your agent's usual client and give it this prompt. A local agent that already has browser tools can follow the same flow without a paid client or a ReactBench MCP server.

> Open `<printed session URL>` with your browser tools and use the same tab for the entire run. Read the visible rules before pressing Start. Observe the game in real time and use your own pointer tools to respond to the visible cue. Keep the tab visible. Use the page's visual content and ordinary controls. Avoid inspecting source code, canvas data, network requests, developer tools, seeds, or host files. After the result, let any pending tool actions finish or cancel them. Then check Pending tool actions have finished and choose Prepare next trial. Read the next trial's instructions and press Start when ready. If pending input cannot be verified or cancelled, stop and ask the operator to cancel the session. On completion, report the visible score and any tool failure.

The agent chooses when to observe and what action to take. If it takes a screenshot, its own tool takes it. ReactBench does not send images, poll the screen, supply pointer actions, or require tool logs. The [Codex CLI smoke attempt](codex-cli-smoke.md) reached its configured tools but failed before Start. Genuine client runs remain tracked in [#12](https://github.com/kinba09/react-bench/issues/12) and [#13](https://github.com/kinba09/react-bench/issues/13).

## Session lifecycle

1. **Ready.** The server builds the selected run from its configuration and seed. The page shows the session ID, trial number, level, game rules, relevant reference cues, and a Start button. The browser can preview this state before the timed task begins.
2. **Active.** The first participant tab to press Start claims the session. Each later trial has its own explicit Start. The browser records preparation separately and then begins the timed game. The first registered game click ends the trial, or the trial ends at the deadline. Inhibitory Control can score correct withholding when time expires.
3. **Between trials.** The result is recorded and the board stops accepting scored input. Wait for the agent's pending observations and actions to settle, check **Pending tool actions have finished**, then choose **Prepare next trial**. The page resets the game and shows the next trial. Its clock starts on the next explicit Start.
4. **Complete or cancelled.** The final results appear on the page, with links to download the files. **Cancel session** ends scoring and saves only finished trials. Keep the server running for the browser download links. Ctrl+C stops the server and saves a partial report if the run is still open. Use a new session if the active trial tab is reloaded. Cancel the affected session first, since a reload cannot resume or restart that trial.

The server enforces a short inter-trial pause and requires the acknowledgement in the Prepare request. The page discards pointer gestures whose pointer-down occurred outside the running trial. A fixed pause cannot cancel arbitrary queued browser input. Native pointer events carry no originating trial ID, so a fully delayed gesture whose pointer-down and click both arrive after the next Start can score in the new trial. The agent or operator must drain or cancel pending tool actions before acknowledging readiness. Cancel the session if control over pending input is lost.

ReactBench resets game state between trials. The operator or launcher owns the agent context and any tool-specific cancellation. Use `--context-policy` to record how the agent context was actually handled, whether it was reused or reset externally. The flag records the policy in the report. It does not change the agent's context.

## Event and export contract

The participant uses the browser UI at `/session/<session-id>`. Behind the UI, the local page connects, starts, submits completion, prepares the next trial, and cancels through the session controller. The controller checks the participant and trial identities, validates the browser's event trace against the current scenario, and grades it with the common deterministic grader. Identical completion retries return the recorded result without scoring twice. Conflicting or stale trial submissions are rejected.

The page owns these protocol requests; an evaluated agent does not need to call them. Paths below are relative to `/api/session/<session-id>`. All mutations are JSON POST requests with a tab-local `clientId`, and return the current session view. The view contains `id`, `state`, `index`, `total`, `category`, `level`, `responseWindowMs`, and `correct`. Only the ready view includes the current renderer scenario; it never includes the future trial plan.

| Request | Additional fields and behavior |
| --- | --- |
| `GET` base path | Read the session view without claiming the participant. |
| `POST /connect` | `display`: viewport width/height, device scale factor, and user-agent string. Preview before Start does not claim the session. |
| `POST /start` | Current `trialId` and `display`. Claim the participant and enter active state. The page then starts the browser clock. |
| `POST /complete` | Current `trialId`, `browserTimeOriginMs`, `display`, and browser `events`. Record one terminal trace and enter between-trials or complete state. Identical retries are safe. |
| `POST /next` | `actionsSettled: true`, after the 500 ms minimum pause. Enter ready for the next trial; this does not start its clock. The acknowledgement declares external quiescence and does not cancel tools. |
| `POST /cancel` | `display` when claiming an unstarted session. Close the run and save finished trials only. |
| `GET /results.json`, `/trials.jsonl`, `/report.html` | Read exports after complete or cancelled results have been saved. |

An invalid trace returns HTTP 400; a participant, trial, lifecycle, readiness, or export-availability conflict returns 409. Export write failures return 500 and the page offers Retry. Completion retries must preserve the original body. A lost Start response or active-trial reload cannot recover the browser trace: cancel and launch a new run rather than starting that trial again.

Each browser event includes `trialId`, `type`, `atMs`, `clock`, and `phase`. `atMs` is a `performance.now()` timestamp in milliseconds. The trial records `timing.browserTimeOriginMs` to identify the browser clock. Preparation and Start are recorded as `prepared` and `started`. `activated` records the actual scoring-window onset and deadline. Dynamic Tracking records `phase-transition` for occlusion and reappearance. Delayed-stop trials distinguish the scheduled stop time from an observed `stop-signal`. A terminal `action-registered` event records the click and category-specific hit evidence. An `expired` event records a deadline reached without a scored click. An expired trial can represent successful withholding. The `outcome` and, for Inhibitory Control, `conditionOutcome` determine the score.

Reaction latency is the elapsed browser time from the scoring-window onset to the registered click on a successful response. On Dynamic Tracking levels 4 and 5, the scoring window opens when the objects reappear. Withholding and other outcomes without a valid response have null reaction latency. The session records browser input in `events` and leaves the separate runner `actions` list empty. Model processing time and any unavailable external tool timing stay unknown. The benchmark measures browser software timing.

| File | Contents |
| --- | --- |
| `results.json` | Schema version 2, run ID and status, planned trial count, category, configuration and seed, benchmark provenance, agent and environment metadata, summary, and recorded trials. |
| `trials.jsonl` | One JSON object per recorded trial, including its seeded scenario, outcome, browser events, timing, and actual display settings. A cancelled run includes only completed trials. |
| `report.html` | Offline report of recorded outcomes, timing, difficulty, and setup, with links to the machine-readable files. |

The files are saved to `--output` or a new timestamped directory under `results`. After completion or cancellation, the same files are available under `/api/session/<session-id>/` while the server runs. Keep the exported files together when opening the offline report. Report `comparisonClass` identifies `visual` browser sessions and `control-only` runs from the credential-free privileged oracle. When sharing results, identify scripted fixture runs as such. The agent name, model, client, tool, and context policy are operator-provided. The browser reports viewport size, device scale factor, and its own user-agent string. CPU and platform metadata describe the runner host. Use matched seeds, configurations, display settings, and tool/context profiles for comparisons.

## Trust boundary

The visible rules and controls disclose the information the participant needs to play. They do not reveal hidden ground truth or upcoming scenarios, and scored pages do not expose the practice and oracle snapshot interface. The renderer still receives current scenario data, including information that a local inspector could use to infer hidden details. The future trial plan stays on the server. Use the visible page and ordinary input for scored comparisons. ReactBench assumes a trusted local participant and offers no host-level or network isolation from arbitrary local tools.

## Issue #11 review checklist

The table maps all 11 requirements to the implementation and validation for [issue #11](https://github.com/kinba09/react-bench/issues/11). On 2026-11-26, `npm test` passed all 57 tests. After the final session-control fix, `npm run build` followed by `node --test --test-concurrency=1 tests/session*.test.mjs` passed all 15 session tests, including the new pending-request regression. `npm run typecheck` also passed. These are scripted Chromium participants, without commercial credentials or claims of genuine model performance.

| # | Requirement | Implementation and review evidence |
| --- | --- | --- |
| 1 | Local launch from configuration and seed | The [CLI](../src/cli.ts) accepts `--config`, `--seed`, and `--no-open`. The launch example prints an agent-accessible session URL. |
| 2 | Visible instructions, references, identity, and readiness | The [session UI](../src/session-client.ts) and [game page](../web/index.html) present the session, trial, rules, and Start control. The shared [browser tests](../tests/session.test.mjs) check preparation and timing. |
| 3 | Seeded progression, real input, and deterministic grading | The [session controller](../src/session.ts) advances the seeded plan and uses the common [grader](../src/grader.ts). [Browser tests](../tests/session.test.mjs) exercise native clicks, transitions, deadlines, and withholding. |
| 4 | Agent-owned observation and input | The agent opens the regular browser page and supplies its own input. The session exposes no observation feed or action bridge. [Browser tests](../tests/session.test.mjs) run without benchmark screenshot calls. |
| 5 | Session, event, and export contract | The lifecycle and export sections above describe the public workflow. [The shared types](../src/types.ts) define the event, trial, and run records. |
| 6 | Explicit inter-trial readiness and quiescence | [Protocol and browser tests](../tests/session.test.mjs) cover the inter-trial pause, the acknowledgement before Prepare, stale trial IDs, pointer gestures crossing trial boundaries, and the stopped clock until Start. [The handoff regression](../tests/session-handoff.test.mjs) checks controls stay locked during a pending transition. Arbitrary late-input cancellation remains with the tool operator. |
| 7 | Reset game state and record context policy | Each Prepare action sets up a fresh game board. `--context-policy` records the externally managed policy. The lifecycle above describes cancellation and reset ownership. |
| 8 | Keep hidden evidence out of the participant controls | The scored view has visible cues and ordinary controls. [Browser tests](../tests/session.test.mjs) check that the scored page has no oracle snapshot interface. The trust boundary above explains what local inspection could still reveal. |
| 9 | Provider-neutral example | The launch command and reusable prompt above use the agent's existing browser tools. |
| 10 | Scripted completion and separate offline oracle | [Browser tests](../tests/session.test.mjs) complete seeded scored sessions and check JSON, JSONL, and HTML. The credential-free oracle is labelled `control-only`. |
| 11 | Label the evaluated setup | The [CLI](../src/cli.ts) takes agent, model, client, tool, and context-policy metadata. The [report contract](../src/types.ts) records those declarations alongside actual browser display settings. Scoring uses browser events without tool-log requirements. |
