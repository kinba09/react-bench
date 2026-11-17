---
name: ReactBench
description: Quiet operational interface for Visual Reaction and Dynamic Tracking tasks.
colors:
  ink: "#20252e"
  muted: "#616a76"
  line: "#dce0e5"
  surface: "#fff"
  ground: "#f5f6f8"
  target-ready: "#cc423a"
  target-active: "#15804c"
  target-complete: "#7c8591"
  target-center: "#ffffff"
  tracking-required: "#e5a82e"
  tracking-distractor: "#e5edf5"
  tracking-outline: "#55718c"
  button-hover: "#3c4757"
  disabled-ink: "#636b78"
  disabled-surface: "#e3e6eb"
  focus: "#216eab"
  selection: "#344a62"
typography:
  headline:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-.03em"
  wordmark:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-.04em"
  body:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "15px"
    lineHeight: 1.5
  status:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
  label:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "13px"
  metric-label:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "12px"
  footer:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: "11px"
rounded:
  control: "6px"
  experiment: "12px"
  circle: "50%"
spacing:
  compact: "4px"
  small: "8px"
  control-gap: "12px"
  mobile-gutter: "16px"
  section-gap: "18px"
  desktop-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-primary-hover:
    backgroundColor: "{colors.button-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled-surface}"
    textColor: "{colors.disabled-ink}"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  experiment:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.experiment}"
  target-active:
    backgroundColor: "{colors.target-active}"
    rounded: "{rounded.circle}"
---

# Design System: ReactBench

## Overview

**Creative North Star: "Quiet operation"**

This describes the shipped benchmark interface, extracted from the implementation rather than a separate user-approved aesthetic. A light neutral frame supports a large task arena. Instructions, trial and level, response window, and result remain readable around either target task.

**Key Characteristics:**
- Neutral surfaces and dark, compact type.
- A red-to-green cue or gold reference star as the task's visual focus.
- Explicit phase text and restrained practice controls.
- Flat surfaces, thin borders, and generous arena space.

## Colors

The palette uses neutral framing with functional cue colors; frontmatter records the implemented values.

### Primary

- **Active Green** signals an actionable target and also appears in the small wordmark dot.
- **Ready Red** marks the target before activation.
- **Complete Gray** marks the target after a trial ends.
- **Target Center White** provides the small center point in every target phase.

### Neutral

- **Ink** carries headings, results, and the primary button fill; **Muted** carries explanatory text and labels.
- **Ground** surrounds the white **Surface** arena and select. **Line** defines dividers, controls, and the arena boundary.
- **Button Hover**, **Disabled Ink**, and **Disabled Surface** distinguish control states.
- **Focus Blue** identifies keyboard focus. **Selection Blue** backs selected text with white foreground.

**The Cue Rule.** Preserve the target's visual identity alongside an explicit written reference or phase instruction.

## Typography

Use the system font stack in the frontmatter; there is no bundled font. The page title is the largest text, with a tighter wordmark and a compact supporting hierarchy. Status text is semibold; instructions are regular. Labels and rules use the label size, while metric captions and the footer step down further. Level and result values are semibold; trial and metric values use tabular numerals.

The title reduces to (27px) at the mobile breakpoint. Body line height is inherited by controls and supporting text unless the headline overrides it.

## Layout

Header, main, and footer share a centered container capped at (1120px), with (40px) minimum side gutters on desktop. The header is (80px) tall. The introduction places task text opposite right-aligned trial and level information.

The bordered experiment contains a status strip above a full-width canvas (310px high). The strip uses (16px 22px) padding, an (18px) gap, and a minimum height of (57px). Rules sit below the arena opposite response-window and result metrics. The practice form follows a divider; the footer is quiet and separated by whitespace.

At widths up to (650px), side gutters become (16px), the header becomes (64px), the instruction line wraps below the phase and attempt label, and the canvas is (300px) high. Rules and metrics stack, the practice label occupies its own row, controls wrap, and the footer stacks. Preserve the arena's usable area rather than compressing all supporting content into one row.

## Elevation & Depth

The implemented interface has no shadows, gradients, or animated transitions. White surface against pale ground, thin divider lines, and spacing establish hierarchy. The focus outline is an interaction state rather than elevation.

## Shapes

The experiment has softly rounded corners; controls use the smaller radius. Borders are thin (1px). The Visual Reaction cue is a solid circle with a white center dot (4px radius), drawn on canvas; its target radius and position come from the scenario. Dynamic Tracking uses one gold five-point star among neutral outlined circles, with the same star drawn in its on-canvas reference. The wordmark uses a separate small circular dot (7px diameter).

## Components

### Buttons and select

The primary action is a compact ink-filled button with white semibold text. Both button and native select have a minimum height of (38px) and share control padding and rounding. Hover changes the button fill. During a trial, the button becomes pale gray with muted text and a wait cursor. Keyboard focus uses a blue outline (3px) offset by (3px). The select keeps native selection behavior and a white surface.

### Experiment and phase strip

The white experiment clips its contents to the rounded border. Its status strip separates a semibold phase label from a plain-language instruction and a right-aligned attempt label. The instruction is a polite live region. Mobile wrapping preserves the phase and instruction hierarchy.

### Target and result

For Visual Reaction, the target changes from ready red to active green to complete gray without a decorative transition, and its white center dot persists. Dynamic Tracking keeps the star reference visible and marks the required moving target with a gold star among neutral outlined distractors. The arena uses a crosshair cursor and touch manipulation. Result text communicates the outcome or measured latency below the arena; it does not add an independent badge or color treatment.

### Practice controls

The label, native difficulty select, and start button form a small row after a divider, wrapping on mobile. Controlled runs hide this form. The mode label distinguishes local practice, the oracle control baseline, and visual-agent evaluation.

## Do's and Don'ts

### Do:

- **Do** keep phase instructions, trial, level, response window, and result legible around the arena.
- **Do** use neutral framing and preserve each task's target identity.
- **Do** retain visible keyboard focus and mobile wrapping for practice controls.

### Don't:

- **Don't** replace the written phase and outcome information with color alone.
- **Don't** obscure the target with decorative imagery or overlays.
- **Don't** treat this implementation snapshot as evidence of user-approved branding or a permanent direction for unimplemented categories.
