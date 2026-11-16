# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Computer-use agent researchers and developers running local, reproducible evaluations.

## Product Purpose

Measure the complete perception, decision, and action loop under explicit time constraints. The initial implemented slice is Visual Reaction in Chromium; the agreed broader design contains six categories.

## Operating Context

Local browser games and command-line evaluation. Standard runs use a 1280 × 720 viewport, device scale 1, seeded scenarios, independent two-Hz capture, and labelled privileged oracle control results.

## Capabilities and Constraints

Five Visual Reaction levels, three trials per level, one click per cue. Deterministic grading, software timing with clock provenance, unavailable model timings marked unavailable, and no composite score. No paid API is required for the oracle. Later categories and Codex/Claude integrations are separate tickets.

## Evidence on Hand

The project glossary, design discussion, specification issue #1, and implementation issue #2. No genuine evaluated visual-agent results exist yet.

## Product Principles

- Grade real task conditions and preserve failures.
- Distinguish measured software timing from physical display timing.
- Keep benchmark behavior independent of evaluated-agent reasoning.
- Keep setup and operation local and reproducible.
