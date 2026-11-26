# ReactBench design

Updated decision: ReactBench runs the benchmark in a browser; agents operate it through their own browser/computer tools. This supersedes the earlier fixed-rate screenshot feed and required screenshot/action MCP bridge. Game rules and scoring remain as agreed. Timing defaults remain uncalibrated.

## Agreed scope

- Six categories, five levels each, and three trials per category per level: 90 trials per agent setup in the full initial profile.
- Local browser games continue advancing while an agent observes, reasons, and acts.
- ReactBench presents instructions, controls trial lifecycle, records game events and input registration, grades deterministically, and exports results.
- Agents own browser/computer observation and input. ReactBench does not capture continuously, supply screenshots, or prescribe screenshot cadence for evaluated sessions.
- An agent can use its own tools, including a tool backed by MCP. No ReactBench screenshot/action bridge or mandatory agent adapter is required.
- Keep privileged oracle validation separate from external-agent evaluation. Existing visual-task rules still prohibit hidden-state inspection, game-function calls, and DOM/JavaScript shortcuts to solve the task; using an agent's own tools does not grant oracle access.

## Games and progression

| Category | Game | Level 1 to level 5 progression |
| --- | --- | --- |
| Visual Reaction | Wait for a red target to become green, then click it. | Progressively shorter green response windows. |
| Target Acquisition | Use a visible reference to find exactly one correct target among distractors. | 6, 16, 36, 64, and 100 total objects. |
| Dynamic Tracking | Click the required moving object among moving distractors. | 1, 5, 15, 30, and 60 total moving objects; temporary target occlusion in levels 4 and 5. |
| Inhibitory Control | Respond to green, withhold on red, and withhold responses on delayed-stop trials. | Shorter response windows and later stop cues within delayed-stop trials. |
| Multi-Step Reaction | Act on signals presented one at a time, each with its own deadline. | Sequences of 2, 3, 4, 6, and 8 cues. |
| Temporal Decision-Making | Use a visible progress indicator to click at the center of an upcoming activation window. | Progressively narrower activation windows. |

Target size and movement speed remain constant across the initial difficulty levels. Their exact values remain implementation defaults to record in run metadata; the agreed timing settings below are initial configurable values, not calibrated difficulty claims.

### Initial timing settings

All durations in the table are seconds.

| Setting | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --- | --- | --- | --- |
| Visual Reaction response window | 5 | 4 | 3 | 2 | 1 |
| Target Acquisition time limit | 10 | 10 | 10 | 10 | 10 |
| Dynamic Tracking click window | 10 | 10 | 10 | 10 | 10 |
| Inhibitory Control response window | 5 | 4 | 3 | 2 | 1 |
| Delayed-stop signal delay after go | 0.10 | 0.25 | 0.40 | 0.55 | 0.70 |
| Multi-Step Reaction deadline per step | 5 | 5 | 5 | 5 | 5 |
| Temporal Decision-Making activation-window width | 4 | 3 | 2 | 1 | 0.5 |

Initial cues appear after a seeded random wait of 1–4 seconds. Multi-Step Reaction uses one per-step deadline within a trial, rather than treating the entire sequence as a single five-second window.

### Dynamic Tracking occlusion

At levels 4–5, the game explicitly shows Watch → Hidden → Click phases. The visible introduction lasts 1.5 seconds, followed by 1 second hidden at level 4 or 2 seconds hidden at level 5; the agent waits and clicks after the target reappears.

The ten-second click window and reaction-latency clock begin at reappearance, so required waiting does not inflate reaction latency. Earlier clicks fail the trial; a small visible countdown shows remaining trial time so the agent can distinguish waiting from a completed trial.

Dynamic Tracking is graded as a correct or incorrect hit, with no pointer-to-center distance metric. Predictive Reaction is not a separate category.

### Inhibitory Control

Go/no-go and delayed-stop variants are reported separately. A delayed-stop trial shows the same initial green cue as a go trial, then switches to a red stop cue. Delayed-stop succeeds when the response window ends without a registered click. A click before or after the observed stop cue immediately fails the trial. If a click ends the trial before the stop cue was shown, the trace retains its planned timing and the report leaves observed timing unavailable.

The three initial trials at each level consist of one go, one no-go, and one delayed-stop trial. This composition is included within the 90-trial run, not added on top of it.

### Attempts and outcomes

Each target or cue permits one click attempt. An incorrect or premature click fails the trial, and the first incorrect click in Multi-Step Reaction fails the sequence; retries cannot recover the score.

Correct withholding on no-go and stop trials is a successful outcome. Intentional waiting is not automatically classified as a timeout failure.

## Observation and timing ownership

The benchmark owns the game, browser-event instrumentation, trial schedule, grading, and exports. The agent owns when and how it observes and acts through its own tools. The page remains active during slow observations, tool calls, and reasoning. ReactBench does not feed images to the agent or require observation telemetry to grade a trial.

Record actual browser/display settings and tool identities. Use a 1280 × 720 viewport and device scale 1 as the initial controlled profile where the agent's tool supports them; otherwise record the actual settings and label the profile separately. Different tool setups measure different complete agent setups rather than isolated model inference speed.

Measure reaction latency from task-defined stimulus activation to browser input-handler registration using the same browser clock. For occluded tracking the trigger is reappearance; sequences have per-step triggers. Correct withholding has no invented click latency; Temporal Decision-Making retains signed and absolute center-relative error.

Agent-tool logs may supply additional observation/dispatch timings, but they are optional evidence. Missing screenshot timestamps, decision completion, internal model timing, or hardware details remain unavailable. Never derive cross-clock intervals without validated synchronization or claim exact physical display timing.

Report correct/total counts, failure reasons, valid-response medians with sample counts, and individual evidence. Keep categories separate, produce no composite score, and mark P95 insufficient samples for the three-trial profile.

## Browser evaluation protocol

1. Start a local evaluation session with a configuration, seed, and agent/tool metadata. Open the task in a browser the agent can access, or provide its URL for the agent's own tools to open.
2. Show rules, reference targets, run/trial identity, and a visible readiness/start control. Preparation time is separate from response latency; do not start deadlines while waiting for the agent to connect.
3. After readiness, begin the category's phases and seeded initial wait. The agent observes and acts through its own tools; the environment continues in real time.
4. Record actual game transitions and browser-registered input under the active trial identity. Grade recorded evidence, including misses, early/wrong clicks, omissions, and successful withholding.
5. Close completed/cancelled trials to scoring. Use explicit inter-trial readiness and quiescence so pending external input cannot score against the next trial. Native pointer events do not carry their originating trial ID; do not claim late-input attribution or cancellation guarantees without evidence from the external tool. Record limitations and test the chosen transition policy.
6. Reset game state and prepare the next seeded trial. Fresh agent context is managed by the external launcher/operator and must be documented; the benchmark page cannot reset an arbitrary external agent's memory.
7. Export JSON, JSONL, and an offline report with complete trial evidence. Keep ground-truth state and future scenarios outside participant-facing instructions and controls; hardening against malicious local tools is outside the initial trust boundary.

For delayed-stop trials, sample planned delays uniformly within 80%–120% of each nominal center using the trial seed. Keep nominal, sampled planned, and observed signal times distinct.

## Client integrations

Codex CLI, Claude Code, API-backed agents, local agents, and existing computer-use frameworks all target the same browser task using their own tools. Optional launch helpers may provide the URL, rules, browser connection details, metadata, fresh context, and cancellation coordination. They must not replace the agent's observation/action loop with a ReactBench image feed.

Use each client's supported local authentication. Client/model access and tool availability are setup prerequisites to validate, not assumptions established by this plan. Default CI uses scripted browser participants without commercial credentials; genuine client smoke runs are opt-in and must provide evidence before live support is claimed. No mandatory ReactBench MCP bridge is planned.

## Implementation status and migration

Visual Reaction, Target Acquisition, and all five Dynamic Tracking levels are implemented; PR #19 completed occlusion. Inhibitory Control includes go, no-go, and delayed-stop. Browser practice works, and the privileged offline runner produces reports for these games.

Scored sessions run at `npm run session`, defaulting to three seeded level-1 Visual Reaction trials. The Target Acquisition and Dynamic Tracking configs each run all five levels with three trials per level. The page connects to a loopback session controller, claims the session on Start, and submits browser event traces for deterministic server grading. Explicit preparation/start separates trials, cancellation exports finished trials as an incomplete run, and lost completion responses can be retried without rescoring. The session remains available for report downloads.

The sampler and screenshot-rate configuration have been removed from session and offline oracle execution. Schema 2 omits required image/cadence records, uses browser-clock preparation for sessions, and records actual per-trial display settings. External dispatch/model timing remains unavailable. Browser traces are trusted local application evidence, not tamper-proof against malicious local tools. Active-trial reload recovery, genuine client validation, and session support for the other games remain follow-up work.

See [the implementation plan](plan.md) for dependencies and parallel work. Multi-Step Reaction and Temporal Decision-Making retain their agreed game rules and can develop alongside the session migration with coordinated shared contracts.
