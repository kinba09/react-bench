# ReactBench design discussion

This document captures the agreed design. Timing defaults remain uncalibrated. Issues #2–#5 implement Visual Reaction, Target Acquisition, and all five Dynamic Tracking levels; issue #6 adds Inhibitory Control go/no-go trials. Delayed-stop and the other categories remain planned separately.

## Agreed scope

- Six categories, with five numbered difficulty levels per category.
- Controlled games in Chromium, advancing while the agent observes, reasons, and acts.
- Initial runs contain three trials per category per level: 90 trials per agent per observation setting. Larger runs can be configured later.
- No bundled offline pixel-based visual baseline is required. A privileged scripted oracle supports offline runs; visual agents use the screenshot/action adapter.
- Evaluated visual agents receive screenshots and task instructions and interact through mouse/keyboard actions, without privileged environment state or DOM access.

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

Go/no-go and delayed-stop variants are reported separately. A delayed-stop trial succeeds only if no click registers during its response window; pre-stop and post-stop responses are reported separately as failed stops.

The three initial trials at each level consist of one go, one no-go, and one delayed-stop trial. This composition is included within the 90-trial run, not added on top of it.

### Attempts and outcomes

Each target or cue permits one click attempt. An incorrect or premature click fails the trial, and the first incorrect click in Multi-Step Reaction fails the sequence; retries cannot recover the score.

Correct withholding on no-go and stop trials is a successful outcome. Intentional waiting is not automatically classified as a timeout failure.

## Observations and timing

Screenshot capture runs independently at the configured cadence, retaining the latest available image. The standard configuration uses a 1280 × 720 browser viewport, device scale 1, and two screenshots per second; reports record the actual cadence achieved, and agents compared within a profile use identical display settings.

Reaction latency uses a task-defined stimulus activation and browser action registration measured on the same browser clock. This is software timing rather than exact physical pixel-onset timing; screenshot request/return measurements are separate, and unexposed internal model timings remain unavailable.

Category metrics retain their meaning: reaction delay, hit accuracy, inhibition outcomes, sequence accuracy, and activation-window timing error are not combined into one score. Trials with no required click do not receive an invented reaction latency.

The initial report includes correct/total counts, individual outcomes, and measured timings. P95 is marked "insufficient samples" in the three-trial profile; larger profiles can support later P95 comparisons.

## Agreed run protocol

1. Preparation: provide rules and reference targets before asking the adapter to signal readiness. After readiness, begin the seeded 1–4 second initial wait; preparation time is logged separately from reaction latency.
2. Trial isolation: reset game state and agent context between trials. Attribute late responses to their originating trial and discard them before they can affect the next trial; use the same seeded scenarios and order for agents compared under the same profile.
3. Adapter boundary: the initial release uses trusted local adapter code behind an image/action-only interface. Visual agents receive instructions and screenshots without DOM, hidden state, or future seeds; sandboxing arbitrary untrusted adapter code is additional scope.
4. Stop-delay randomization: treat the approved stop-delay values as nominal centers and sample each planned stop delay uniformly from 80% to 120% of its nominal value using the trial seed. Log nominal, planned, and actually observed browser timings separately; all proposed delay ranges remain within the approved response windows.

## Decision tree status

1. Game rules: progression, category explanations, and wait-and-reacquire occlusion behavior agreed.
2. Trial composition: agreed, including one go, one no-go, and one delayed-stop trial at each Inhibitory Control level.
3. Timing configuration: agreed, including response windows, cue delays, Watch → Hidden → Click phases, viewport, device scale, and screenshot cadence.
4. Run protocol: preparation, trial isolation, matched seeded scenarios, trusted adapter boundaries, and stop-delay randomization agreed. Initial small-sample reporting is agreed.
5. Execution surfaces: Codex CLI and Claude Code are agreed client integrations through a shared restricted MCP screenshot/action bridge. A provider-neutral adapter interface also supports users bringing API-backed or local agents without a coding subscription; integrations require implementation validation.
6. Implementation: issues #2–#5 deliver Visual Reaction, Target Acquisition, and all five Dynamic Tracking oracle paths, including wait-and-reacquire occlusion. Issue #6 adds the Inhibitory Control go/no-go oracle path with one go and one no-go trial at each level; delayed-stop and the remaining sub-issues define the rest of the MVP.

## Agreed client integrations

Codex CLI is installed locally. Official documentation supports ChatGPT subscription sign-in, non-interactive execution with saved CLI authentication, and local MCP servers; the benchmark adapter will combine those capabilities through the official CLI.

Claude Code is also included in the design. Official documentation supports eligible Claude subscription sign-in, MCP servers with inline image results, and non-interactive CLI execution with `claude -p`; the subscription route uses the official client and its native authentication. Claude Code is not currently installed on this machine, and no installation has been requested.

- Start the benchmark browser and local screenshot/action bridge.
- Use Codex CLI authenticated with the user's ChatGPT account, or Claude Code authenticated with an eligible Claude account. API authentication is a distinct billing route.
- Provide fresh instructions and context per trial and restrict the evaluated agent to screenshots and permitted input actions.
- Capture screenshots at the configured cadence; the agent requests the newest available image. Capture cadence does not imply model decisions at the same frequency.
- Record browser outcomes and exposed tool/adapter timings; internal model processing remains unavailable when not exposed.
- Identify results by the configured client, model, and bridge; these measure the complete agent setup. Subscription usage limits apply; provider API usage has separate billing.

These client adapters have not been implemented or validated. Visual Reaction, Target Acquisition, and all five Dynamic Tracking levels can run locally through the offline oracle; the other categories and client integrations remain separate implementation tickets.

References: [authentication](https://learn.chatgpt.com/docs/auth), [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode), [separate API billing](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform).

Claude references: [authentication](https://code.claude.com/docs/en/authentication), [MCP and image results](https://code.claude.com/docs/en/mcp), [CLI automation](https://code.claude.com/docs/en/headless), [eligible subscription access](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan).

## Bring your own agent

ReactBench does not require a Codex or Claude subscription. The common adapter contract lets a user connect an API-backed agent, a locally hosted visual model with an action loop, or an existing computer-use framework.

The intended workflow is to run the local benchmark, configure or implement a thin adapter for the user's agent, and select a benchmark configuration. The adapter supplies screenshots and instructions to the agent and translates its chosen actions into the same permitted browser inputs used by other evaluated agents; provider-native computer-use action formats are translated at this boundary.

MCP is the client-facing route for Codex CLI and Claude Code, not a mandatory dependency of every custom agent. API-backed agents use the user's own separately billed API access; local agents use the user's own runtime and hardware. The benchmark does not require a subscription login to connect either route.

Results include agent/model identity, client or harness version, observation policy, input interface, seed/configuration, and available environment metadata. An existing agent must conform to the selected observation/action profile for directly comparable results; screenshot-only restrictions continue to apply.

The offline oracle remains available for checking the benchmark without a model or commercial account and is clearly separated from evaluated visual-agent results.
