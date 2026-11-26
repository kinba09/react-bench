# Codex CLI browser smoke validation

## Observed result

The local Codex CLI attempt on 2026-11-25 (America/Phoenix) authenticated through the existing ChatGPT sign-in and reached its configured computer-use tools. Browser access failed before the participant pressed Start. No scored agent result was produced.

The run used Codex CLI 0.158.0 and `gpt-6-sol`, which appeared in the CLI's available model catalog. The saved CLI configuration named `gpt-6.1-sol`, which the account rejected, so the smoke attempt supplied an explicit model override. The global configuration was left unchanged.

The browser tool failed with `native pipe closed before response`. The subsequent native-app attempt reported `Computer Use was not approved to use Brave Browser`. The CLI then stopped without starting the trial. Browser access in the desktop parent chat does not establish that a separate CLI process has that same access.

## Trial profile

The attempted profile used Visual Reaction level 1, one seeded trial, a 1.5–2 second initial wait, and a relaxed 45-second response window. This was an integration check. Keep it labelled separately from the standard response-window profile in any future results.

The agent received the session URL and instructions to read the page, press Start, observe with its own tools, and click the target once it turned green. Its prompt excluded source inspection, game-state access, page JavaScript, shell commands, and direct session API access. ReactBench supplied no images.

## Repeating the check

1. Confirm `codex login status`, `codex --version`, and `codex debug models` in the terminal that will run the agent. Choose a model listed for that account.
2. Check `codex mcp list` and confirm that the configured browser/computer tool can open a browser from that CLI process. A listed tool still needs working transport and app permissions.
3. Start a local session with `npm run session -- --no-open --port 0 --agent "Codex CLI" --model MODEL --tool TOOL`. Record the actual model and tool names.
4. Run a fresh CLI conversation with the printed URL and the visual task instructions. Keep authentication in the official client. The agent should open the page, press Start, observe, and act through its own tools.
5. Retain the resulting ReactBench exports and permitted client timing evidence. Record browser/tool access errors as integration failures, and leave unexposed model timings unavailable.

Live Codex support still requires a successful authenticated browser-session run. Scripted Chromium tests validate the session implementation separately.
