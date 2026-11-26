# ReactBench MVP: dynamic browser games and computer-use agent evaluation

The confirmed evaluation boundary is a real browser game operated by agents using their own browser/computer tools. This revision supersedes earlier fixed-rate image delivery and custom screenshot/action bridge requirements. Publication target: GitHub Issues in kinba09/react-bench. Triage label: ready-for-agent.

## Problem Statement

Researchers and agent developers need to understand how accurately, quickly, and reliably an evaluated agent setup responds to changing visual environments under time constraints. A task-completion result alone does not explain missed stimuli, premature actions, screenshot delays, stale observations, slow decisions, or actions that arrive after their target moves.

They need a reproducible local benchmark that measures the complete perception, decision, and action loop, supports different clients and model providers, and makes its measurement limits visible. Users should be able to evaluate subscription clients, API-backed agents, and locally hosted agents through comparable observation and action rules without requiring a particular commercial account.

Current implementation includes browser practice, Visual Reaction, Target Acquisition, all five Dynamic Tracking levels, and Inhibitory Control with go, no-go, and delayed-stop. The privileged offline oracle produces reports for these games. Visual Reaction, Target Acquisition, and Dynamic Tracking support scored browser sessions with visible readiness, native-tool input, cancellation, and exports. The default is three seeded level-1 Visual Reaction trials. Continuous screenshot capture has been removed from session and oracle execution. Other-game sessions and genuine client validation remain in #10/#11 and #12/#13.

## Solution

Build ReactBench as six controlled Chromium benchmark games, each with five numbered difficulty levels. The initial evaluation contains three trials per category per level, for 90 trials per evaluated agent setup and declared tool profile. The environment continues advancing while an agent observes, reasons, and acts.

Provide a browser evaluation session with visible instructions/readiness, seeded progression, deterministic browser-event grading, honest timing, and local result exports. Agents operate the page using their own tools. Optional client launchers may coordinate setup and context resets, but ReactBench supplies no screenshot feed, continuous capture, or required custom screenshot/action bridge. Retain a separately labelled privileged offline oracle control and category metrics without an overall score.

## User Stories

1. As an agent researcher, I want controlled dynamic games, so that I can evaluate responses to changing visual conditions.
2. As an agent developer, I want the complete perception, decision, and action loop measured, so that tool and observation overhead remains visible in results.
3. As a local user, I want to run ReactBench on my own machine, so that benchmark execution does not depend on hosted infrastructure.
4. As a local user, I want an offline oracle baseline, so that I can validate the benchmark without a commercial model account.
5. As a researcher, I want the oracle clearly identified as privileged, so that its results cannot be mistaken for fair visual-agent performance.
6. As an evaluator, I want six categories and five numbered levels, so that I can inspect performance across distinct tasks and difficulty settings.
7. As a developer, I want three initial trials per category per level, so that I can validate the workflow before expanding evaluation volume.
8. As an evaluator, I want configurable trial counts and category selections, so that the initial 90-trial profile can grow without redesigning the benchmark.
9. As a researcher, I want configurable game timing and a declared agent tool setup, so that comparisons have explicit conditions without imposing a benchmark screenshot rate.
10. As a Visual Reaction participant, I want a red target to turn green after a random wait, so that my response delay can be measured from its activation.
11. As an evaluator, I want Visual Reaction response windows to shorten across levels, so that later levels impose greater response pressure.
12. As a Target Acquisition participant, I want a visible reference identifying the correct target, so that the task has an unambiguous visual objective.
13. As an evaluator, I want exactly one matching target among increasing numbers of distractors, so that crowding makes Target Acquisition harder.
14. As a Dynamic Tracking participant, I want a required moving target among moving distractors, so that selecting and hitting the correct object is evaluated.
15. As an evaluator, I want Dynamic Tracking graded as a hit or a miss, so that success depends on hitting the required target rather than minimizing pointer distance.
16. As a Dynamic Tracking participant, I want explicit Watch, Hidden, and Click phases in levels 4 and 5, so that I know when to wait and when clicking becomes valid.
17. As a Dynamic Tracking participant, I want a small remaining-time countdown during occlusion, so that I know the trial is still active.
18. As an evaluator, I want the Dynamic Tracking response clock to begin at reappearance, so that mandatory waiting does not inflate reaction latency.
19. As an Inhibitory Control participant, I want green go cues and red no-go cues, so that appropriate action and withholding can both be evaluated.
20. As an evaluator, I want delayed-stop trials, so that I can evaluate withholding after an initial go cue.
21. As an evaluator, I want pre-stop and post-stop responses recorded separately, so that failed stops remain interpretable.
22. As a developer, I want one go, one no-go, and one delayed-stop trial at every Inhibitory Control level initially, so that all three conditions are covered within the agreed trial count.
23. As a researcher, I want stop delays to vary reproducibly around their nominal values, so that trials do not always use one fixed stop schedule.
24. As a Multi-Step Reaction participant, I want cues presented one at a time with individual deadlines, so that I can respond to each step in order.
25. As an evaluator, I want sequence lengths to increase across levels, so that longer chains of correct responses are evaluated.
26. As an evaluator, I want both whole-sequence accuracy and per-step delay, so that one failed sequence does not hide its individual response history.
27. As a Temporal Decision-Making participant, I want a progress indicator announcing an upcoming activation window, so that I can time my click.
28. As an evaluator, I want narrower activation windows at higher levels, so that timing precision becomes more demanding.
29. As an evaluator, I want signed and absolute timing error relative to the activation window's center, so that early and late responses can be distinguished.
30. As an evaluator, I want one click attempt per target or cue, so that repeated clicking cannot rescue an incorrect attempt.
31. As an evaluator, I want premature and incorrect clicks to fail the relevant trial, so that success reflects the actual task conditions.
32. As an evaluator, I want correct withholding counted as success on no-go and stop trials, so that intentional inaction is not treated as a timeout failure.
33. As an agent participant, I want instructions and reference targets before signaling readiness, so that preparation is separate from the reaction task.
34. As an evaluator, I want game state reset between trials and the external agent-context policy recorded, so that isolation claims are explicit and verifiable.
35. As an evaluator, I want completed trials closed to scoring and an inter-trial readiness/quiescence policy, so that pending external input cannot silently affect the next trial; attribution depends on what the agent tool exposes.
36. As a researcher, I want identical seeds and scenario ordering across compared agents, so that differences do not come from different generated tasks.
37. As a researcher, I want matched browser/display and game settings with declared tool/context policies, so that comparable complete agent setups can be identified.
38. As an evaluator, I want hidden state and future scenarios excluded from participant-facing instructions and controls, so that agents solve the visual task.
39. As an evaluator, I want the existing visual-task rules to prohibit DOM/JavaScript shortcuts and hidden-state inspection, even when agents bring their own tools.
40. As an agent participant, I want to open or attach to the benchmark browser through my own tools, so that ReactBench does not replace my observation/action loop.
41. As a researcher, I want the agent tool identity and actual display settings recorded, so that differing tool setups are clearly labelled.
42. As a researcher, I want the browser game to continue during agent observation, reasoning, and actions without a benchmark screenshot feed, so that task deadlines remain real.
43. As a researcher, I want stimulus activation and action registration measured on the same browser clock, so that primary reaction latency does not subtract unrelated clocks.
44. As a researcher, I want optional observation/tool timings only when exposed by the external agent tooling, so that missing telemetry does not prevent scoring or lead to fabricated timings.
45. As a researcher, I want browser input registration required and external decision/dispatch timings optional, so that timing availability and provenance remain honest.
46. As a researcher, I want unavailable internal model timings marked unavailable, so that reports do not invent inference measurements.
47. As a researcher, I want planned timings distinguished from actual event timings, so that scheduling intent is not mistaken for execution evidence.
48. As a Codex user, I want to use the official CLI with my ChatGPT sign-in, so that I can evaluate that client through supported subscription access.
49. As a Claude user, I want to use Claude Code with supported authentication, so that I can evaluate that client through the same benchmark interface.
50. As an API user, I want my existing agent to operate the benchmark page through its own tools, so that a coding subscription or ReactBench adapter is not required.
51. As a local-model user, I want to connect my own visual model and agent loop, so that I can evaluate without a commercial model API.
52. As a framework developer, I want a documented session URL, visible readiness flow, and export contract, so that I can retain my existing observation/action loop.
53. As an integrator, I want any MCP usage to remain part of my own agent tool setup, so that ReactBench does not require a custom screenshot/action MCP bridge.
54. As a user, I want authentication and credentials handled locally through my agent client or tool setup, so that ReactBench does not require a shared commercial account.
55. As an evaluator, I want agent/model/client, native browser/computer tool, optional launcher, hardware, display, game, and context-policy metadata, so that I can identify the evaluated setup.
56. As a researcher, I want category and difficulty breakdowns with correct/total counts, so that aggregate results do not hide specific weaknesses.
57. As a researcher, I want individual trial logs and failure reasons, so that I can inspect misses, premature actions, failed stops, and expired windows.
58. As a researcher, I want valid response medians alongside success counts, so that fast successful responses do not conceal frequent failures.
59. As a researcher, I want P95 marked insufficient samples in the initial profile, so that three trials per level do not imply reliable tail-latency comparisons.
60. As a researcher, I want accuracy-versus-latency comparisons for labelled compatible agent setups, so that differences in game conditions and native tools are visible without a shared screenshot cadence.
61. As a researcher, I want machine-readable trial data and an offline human-readable report, so that I can analyze and share results without a hosted service.
62. As a contributor, I want category registration and agent integration separated from game rendering, so that I can extend ReactBench without rewriting the benchmark.
63. As a contributor, I want automated behavioral tests and CI without commercial credentials, so that regressions can be checked reproducibly.
64. As a new user, I want setup instructions, example configuration, example result data, reproducibility guidance, and contribution guidelines, so that I can run and extend the project.
65. As a project adopter, I want an Apache-2.0 license and a simple local architecture, so that adoption does not require unnecessary infrastructure or unclear licensing.

## Implementation Decisions

- Keep the Environment Engine, Task Registry, Session Controller, Deterministic Grader, and Results Reporter separate from agent reasoning. Optional Agent Launchers manage client setup/lifecycle only; they do not supply screenshots or route task input.
- Run the browser task locally. Use a 1280 × 720 viewport and device scale 1 as the initial controlled profile where supported; record actual settings and label other profiles separately. No benchmark capture cadence is required.
- Run the environment in real time while agents use their own tools to observe, reason, and act. ReactBench must not continuously capture frames, provide images, or require screenshot telemetry in evaluated sessions.
- The initial profile comprises six categories × five levels × three trials = 90 trials per evaluated agent setup and declared tool profile. A Multi-Step Reaction trial is one complete sequence. Inhibitory Control uses one go, one no-go, and one delayed-stop trial per level within that total.
- Use seeded generation for scenario parameters, target placement, initial delays, stop-delay variation, and trial ordering. Compared agents receive identical generated scenarios and ordering under the same configuration. Reproducibility covers inputs and grading of recorded event traces, not identical real-world execution latency.
- Initial cues follow a seeded random wait of 1–4 seconds after readiness. Keep target size and movement speed constant across the initial difficulty progression; choose explicit implementation defaults and record them in metadata.
- Use the following initial configurable timings and counts. These settings have been agreed as starting values, not empirically calibrated difficulty levels.

| Setting | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --- | --- | --- | --- |
| Visual Reaction response window, seconds | 5 | 4 | 3 | 2 | 1 |
| Target Acquisition total objects | 6 | 16 | 36 | 64 | 100 |
| Target Acquisition response limit, seconds | 10 | 10 | 10 | 10 | 10 |
| Dynamic Tracking total moving objects | 1 | 5 | 15 | 30 | 60 |
| Dynamic Tracking click window, seconds | 10 | 10 | 10 | 10 | 10 |
| Inhibitory Control response window, seconds | 5 | 4 | 3 | 2 | 1 |
| Nominal delayed-stop delay after go, seconds | 0.10 | 0.25 | 0.40 | 0.55 | 0.70 |
| Multi-Step Reaction sequence length | 2 | 3 | 4 | 6 | 8 |
| Multi-Step Reaction deadline per step, seconds | 5 | 5 | 5 | 5 | 5 |
| Temporal Decision-Making activation-window width, seconds | 4 | 3 | 2 | 1 | 0.5 |

- Visual Reaction requires clicking the target after red becomes green and before its response window expires. A premature click fails.
- Target Acquisition presents a visible reference and exactly one matching target among the configured total number of objects. Randomization must preserve a visually identifiable, hittable correct target.
- Dynamic Tracking requires hitting the required moving target; grade the click as correct or incorrect against the relevant ground-truth scene at browser registration. Do not calculate pointer-to-center distance as a performance metric.
- Dynamic Tracking levels 4–5 use explicit Watch → Hidden → Click phases. Show the target for 1.5 seconds, hide it for 1 second at level 4 or 2 seconds at level 5, then reopen clicking on visible reappearance. A small remaining-time countdown indicates the active trial. Earlier clicks fail. The ten-second click window and reaction-latency clock begin at reappearance. Invisible-target interception is not required.
- Inhibitory Control reports go/no-go and delayed-stop outcomes separately. Green requires a response; red requires withholding for the response window. A delayed-stop trial succeeds only if no click registers during its response window; clicks before and after the stop signal are separate failed-stop classifications.
- Sample each planned stop delay uniformly from 80% to 120% of the level's nominal value using its trial seed. Keep nominal values, sampled planned delays, and observed browser event timings distinct. All default delay ranges fit within their response windows.
- Multi-Step Reaction presents one cue at a time with a deadline for each step. The first incorrect or premature click fails the sequence. Report whole-sequence accuracy and each step's outcome and delay.
- Temporal Decision-Making shows visible progress toward an activation window. Grade clicks inside the window as valid, clicks outside as failures, and timing error relative to the window's center. Preserve the sign of error and provide its magnitude for comparisons.
- Allow one click attempt per target or cue. Repeated clicks cannot rescue a failed trial. Classify wrong targets, premature actions, required-response omissions, late actions, and unsuccessful inhibition separately where applicable. Correct withholding is success, not a timeout.
- Show rules and reference targets in the browser before a visible readiness/start action begins the seeded wait. Record preparation separately. Reset game state; external launchers/operators manage and document agent-context resets. Close old trials to scoring and test an explicit inter-trial readiness/quiescence policy for pending native input.
- Keep the session controller responsible for trial schedule, lifecycle, deadlines, game-event collection, and exports. Agents send task input through their own tools. Derive deadlines from category phases and per-step windows so longer sequences are not truncated.
- Present task instructions and reference cues on the page. Agents use their own browser/computer tools for observation and input. Keep hidden state and future scenarios out of participant-facing controls; existing visual-task rules prohibit DOM/JavaScript shortcuts and privileged oracle access.
- Treat local launchers/tools as trusted or reviewed. A browser task is not host-level isolation from malicious agents; separating ordinary task controls from privileged grading/oracle access does not prove tamper resistance.
- Include a deterministic privileged Playwright oracle for offline validation. Always identify its access mode and exclude its results from visual-agent comparisons. Do not bundle an offline pixel-based visual competitor.
- Validate Codex CLI and Claude Code using their own browser/computer tools against the session URL. Optional helpers may launch/configure clients and manage lifecycle; no ReactBench screenshot/action MCP bridge is required. Use supported native authentication and keep credentials local.
- Define a provider-neutral browser session contract: configuration/seed, URL/browser connection, visible instructions/readiness, trial progression, completion/cancellation, metadata, and event/result exports. API-backed, local, and existing agents retain their own observation/action loops without mandatory adapter or MCP integration.
- Identify results as a complete evaluated setup: model, client/reasoning loop, native browser/computer tools, optional launcher, display settings, and context-reset policy. Do not call whole-agent reaction latency isolated model inference speed.
- Require browser stimulus/phase events and input registration with session/trial identities. Additional external tool observation/dispatch/decision logs are optional. Native pointer events have no original trial ID; do not invent late-action attribution or observation IDs absent tool evidence.
- Measure primary reaction latency from the task-defined browser stimulus activation to browser action registration using the same monotonic browser clock. For occluded Dynamic Tracking, the trigger is reappearance; Multi-Step Reaction has a trigger per step. Withholding trials have no invented click reaction latency, and Temporal Decision-Making retains its center-relative timing metric.
- Distinguish software activation from physical pixel onset. Optional external screenshot/tool timings retain their actual source and uncertainty; ReactBench performs no capture to obtain them. Unknown values remain unavailable.
- Measure intervals within a common clock domain. Report cross-process intervals separately unless a validated synchronization method and its uncertainty support the calculation. Unavailable internal model-processing timings remain unavailable; optional externally measured agent decision cycles include client/network overhead and must be named accordingly.
- Produce category and difficulty counts, hit/sequence/completion outcomes, false-action breakdowns, required-response timeouts, and measured timing summaries. Make denominators explicit, distinguish go omissions from successful withholding, and display successful-response latency beside success counts.
- Preserve individual trial logs and machine-readable exports with run/configuration identity, seeds, scenario parameters, scheduled and observed events, available observation/action timings, outcomes, failure reasons, and clock/availability metadata.
- Include available agent/model/client versions, native tool identity, optional launcher version, declared observation/context policy, actual viewport/device scale, browser/runtime, OS, and hardware. Do not require screenshot frequency; unknown values stay unknown.
- Generate offline reports with category/level outcomes, individual evidence, timing summaries, failure breakdowns, and accuracy-versus-latency views. Compare labelled game/browser profiles and declared agent tool/context setups. Keep oracle controls separate; missing external tool timings do not block reports.
- Mark P95 as insufficient samples in the initial three-trial profile. Larger profiles may enable P95 summaries with sample counts and explicit calculation rules. Do not claim statistically reliable rankings or millisecond-level physical precision from the initial profile.
- Retain the initial project requirements for an Apache-2.0 license, setup/usage documentation, example configuration and clearly identified example result data, reproducibility guidance, contribution guidelines, automated tests, and GitHub Actions CI. Keep default validation free of commercial model credentials.
- Retain the small local TypeScript/Chromium architecture, explicit session/event contracts, and documented target-size/movement defaults; avoid databases, distributed services, or mandatory cloud infrastructure.

## Testing Decisions

- Confirmed primary seam: operate the real browser evaluation session through ordinary browser input with a scripted participant, then assert exported trial records/reports. Exercise registry, game events, grading, and reporting through that public flow without requiring an image/action adapter.
- Good tests verify observable outcomes, timing availability/provenance, deadline behavior, permitted input routing, reproducibility of generated scenarios, and report contents. Avoid tests of private functions, rendering component internals, or tests that merely duplicate implementation logic.
- Use scripted browser participants and controlled input schedules for credential-free success/failure tests. They are test fixtures, not offline visual competitors. Retain the privileged oracle as a separately labelled control.
- Existing Chromium runner tests and oracle reports provide implementation evidence. Extend coverage to scored browser sessions; practice alone is not a complete evaluated run.
- Run the complete 90-trial oracle profile offline and verify category/level coverage, configuration propagation, and the one-go/one-no-go/one-stop composition at every Inhibitory Control level.
- Verify each category's successful path and externally distinct failures: early and expired Visual Reaction clicks; correct and incorrect Target Acquisition objects; correct and incorrect moving-target hits; clicks during Watch/Hidden phases; successful reacquisition after reappearance; go omissions, no-go clicks, pre-stop and post-stop failures; complete and failed sequences; and early, valid, and late Temporal Decision-Making clicks.
- Verify increasing object counts and sequence lengths for all levels, the exact default phase durations/configured windows, and that task completion does not depend on pointer distance.
- Check boundary behavior at phase transitions and response-window edges, and document consistent registration/deadline semantics. Assert grading against the recorded task conditions, not agent self-reports or an LLM judge.
- Replay the same seeds/configuration and verify identical generated task parameters and planned ordering. Verify identical recorded traces/configurations grade identically. Do not require identical wall-clock durations across executions or machines.
- Simulate slow participants and delayed native-tool input while the game advances. Verify missed deadlines, cancellation, inter-trial readiness/quiescence, and scoring without ReactBench screenshot capture or delivery.
- Verify visible preparation/readiness, game resets, declared external context policy, and exclusion of completed-trial input from scoring. Test the actual transition policy; do not claim generic cancellation or originating-trial attribution for arbitrary native input.
- Verify participant instructions/controls omit hidden state, future scenarios, and oracle shortcuts, while ordinary native browser input can complete sessions. Preserve visual-task rules without claiming host-level isolation.
- Verify required reaction timings share the browser clock, occlusion waiting is excluded, optional external tool timings have provenance, unavailable timings remain unavailable, and no cross-clock subtraction or screenshot capture is introduced to fill telemetry gaps.
- Verify report denominators, successful withholding, explicit failures, individual logs, unknown metadata fields, median sample counts, P95 insufficient-sample status, and separation of oracle/incompatible-profile results.
- Validate optional client launch/setup, URL/browser handoff, metadata, cancellation, and context policy using fixtures in default CI. Genuine authenticated client runs use each agent's own browser/computer tools, are opt-in, and are required before claiming live support. Missing native tools or access must be reported explicitly.
- CI must run the offline behavioral checks and validate exported data/report structure without paid model calls or committed credentials. Real-time checks should verify ordering, semantic bounds, and recorded durations with justified tolerances rather than assuming exact host scheduling.

## Out of Scope

- A seventh category or a separate Predictive Reaction game; levels 4–5 of Dynamic Tracking instead use visible reacquisition after occlusion.
- Clicking invisible targets, continuous pointer-following tasks, or pointer-to-center distance metrics.
- A separate easy/medium/hard scheme, a mandatory 100-trial-per-category initial run, or a bundled offline pixel-based visual agent.
- An overall composite score, a public leaderboard service, reliable rankings from the 90-trial development profile, or P95 claims from three trials per level.
- General-purpose browser workflow tasks, desktop-wide or mobile benchmark environments, agent-side DOM/JavaScript shortcuts, LLM-as-judge grading, or treating the oracle as a legitimate visual competitor.
- Production isolation of arbitrary untrusted tools/launchers, distributed infrastructure, databases, required cloud services, or hosted credential sharing.
- Bundled integrations for every named existing framework. Agent S, OpenCUA, UI-TARS, Cua, and Browser Use were examples discussed, not additional adapters already approved for implementation.
- Training or shipping a model, guaranteeing free inference on third-party providers, extracting subscription credentials for unsupported API use, or requiring a Codex/Claude subscription for custom agents.
- Claims of exact physical pixel-onset timestamps, fabricated internal model timings, bit-identical real-time performance across machines, or empirically calibrated difficulty before validation.
- Continuous ReactBench screenshot capture, benchmark-supplied image streams, fixed capture rates, a mandatory screenshot/action adapter or custom MCP bridge, and replacement of an agent's native observation/action loop.

## Further Notes

- This specification incorporates the latest browser-first decision: agents own observation/input through their tools, and ReactBench owns the task and scoring. This supersedes earlier screenshot-feed/MCP-bridge requirements while retaining six categories, five levels, binary tracking hits, reacquisition, and three trials per level.
- Preserve modular game/session/grading/reporting boundaries, deterministic scoring, oracle separation, reproducibility, licensing, contribution guidance, and credential-free CI.
- See [the implementation plan](plan.md) for the remaining session coverage, lifecycle validation, and genuine Codex and Claude runs.
- Codex CLI and Claude Code remain planned client targets. Their native browser/computer tools and session attachment must be validated; this plan does not establish live compatibility.
- Label reports as fixture, privileged oracle, or genuine external-agent data. Oracle reports exist; no genuine external-agent session has been validated.
- Publication target is GitHub Issues in kinba09/react-bench with the ready-for-agent label. The user confirmed the testing boundary; there is no additional product interview or triage requirement.
