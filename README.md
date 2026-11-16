# ReactBench

A benchmark design for evaluating how accurately and quickly computer-use agents respond to dynamic graphical tasks in a controlled browser environment.

**Status: design phase.** The games, trial runner, agent integrations, and reports have not been implemented yet.

## Design documents

- [Design specification](docs/design.md): six game categories, five difficulty levels, initial timing settings, scoring rules, and agent integration plans.
- [Domain glossary](GLOSSARY.md): agreed project terminology.

The initial configuration covers 90 trials: six categories × five levels × three trials. Results will retain separate accuracy, timing, and failure metrics.

Planned integrations include Codex CLI, Claude Code, and a common screenshot/action interface for API-backed, local, and existing computer-use agents. A privileged scripted oracle will support offline validation and remain separate from evaluated visual-agent results.
