# PaperDeck Typography Hierarchy Design

Date: 2026-04-02
Project: `D:\VSP\paper-deck`
Status: Approved for planning

## Summary

PaperDeck currently mixes typography decisions across `frontend/src/index.css`, `frontend/tailwind.config.js`, and many JSX call sites. Weight, size, and family are often chosen locally with `font-medium`, `font-semibold`, `font-bold`, inline heading utilities, and occasional `strong` tags. The result is inconsistent hierarchy and unwanted word-level emphasis inside a single phrase.

This design replaces the current mix with a single editorial typography system for the entire frontend. The new system uses a global serif-first direction, fixed semantic hierarchy levels, and a hard rule that emphasis must come from hierarchy rather than inline bolding.

## Goals

- Unify typography across the entire PaperDeck frontend, not just card surfaces.
- Make font family, size, line height, letter spacing, and weight controllable by hierarchy level.
- Remove ad hoc word-level emphasis such as local `font-bold`, `font-semibold`, and `strong` inside otherwise uniform text runs.
- Centralize typography control so future tuning happens in one place instead of across many components.
- Preserve one explicit exception for technical or machine-readable fields that should remain monospace.

## Non-Goals

- No redesign of layout, spacing systems, color systems, motion, or card composition beyond typography-driven adjustments.
- No rewrite of content, IA, or component structure unless required to remove typography leakage.
- No attempt to preserve the current mixed serif-heading and sans-body look. The new direction is intentionally serif-first across the app.

## Current Problems

### Distributed source of truth

Typography is currently controlled by three overlapping layers:

- `frontend/tailwind.config.js` defines font families.
- `frontend/src/index.css` defines global heading rules and many component-specific text styles.
- JSX components apply their own weight and size utilities directly.

This makes it impossible to globally change hierarchy without chasing many local overrides.

### Local emphasis overrides hierarchy

Components currently use local weight utilities for labels, buttons, stats, titles, and chips. Some areas also use `strong` to selectively thicken parts of the same sentence or row. This violates the desired rule that a given hierarchy level should render consistently wherever it appears.

### Mixed design language

The app currently combines editorial headings with product-UI sans defaults. This creates inconsistent tone between navigation, cards, reading surfaces, seeds, subscriptions, and settings.

## Design Direction

PaperDeck should use a single serif-led editorial typography language across the entire frontend. The interface should feel closer to a reading product or research object than a generic SaaS dashboard.

Typography should communicate hierarchy through scale, spacing, and rhythm rather than abrupt local bolding. If a word needs attention, it should move to a higher hierarchy level or become a separate label, not become locally bold inside a text run.

## Source of Truth

### Primary source

`frontend/src/index.css` becomes the authoritative typography system source. It will own:

- font family variables
- hierarchy tokens
- semantic typography classes
- base element resets for headings, buttons, labels, `strong`, and `b`

### Secondary source

`frontend/tailwind.config.js` remains only as a thin font-family bridge for Tailwind usage. It must not remain the place where hierarchy meaning is defined.

### JSX role

Component files consume semantic typography classes. JSX should stop deciding weight directly except for narrow technical exceptions.

## Hierarchy Model

The app will use the following semantic levels.

### `type-display`

For the loudest product or module title. Used sparingly on major entry surfaces.

### `type-page-title`

For top-level page titles and primary section headers that define the current screen.

### `type-section-title`

For section-level titles inside a page or modal.

### `type-card-title`

For paper names, digest titles, list-item titles, and compact content titles.

### `type-eyebrow`

For small uppercase structure labels, kicker text, and section markers.

### `type-body-lg`

For emphasized reading copy, lead text, or primary descriptive lines.

### `type-body`

For standard paragraphs, descriptions, summaries, and helper content.

### `type-meta`

For venue names, timestamps, side information, hints, secondary labels, and UI support text.

### `type-button`

For all button labels and tap targets. Buttons should differ by color and container, not by ad hoc font-weight choices.

### `type-data`

For numeric values, counters, stat readouts, and short structured values.

### `type-code`

For model IDs, API key masks, and technical identifiers. This is the only deliberate non-serif exception.

## Typography Rules

### Font-family rule

The frontend shifts to a serif-first typography direction across the app. Serif is the default family for interface and content text unless a semantic exception says otherwise.

`type-code` remains monospace.

### Weight rule

Each semantic level has a fixed weight. Components must not override that weight locally.

### Inline emphasis rule

`strong` and `b` must no longer create heavier text by default. They should inherit the current weight unless a future semantic container explicitly redefines them, which this design does not plan to do.

### Hierarchy rule

If text needs to stand out more, it must be promoted to a stronger semantic class instead of being locally bolded.

### Exception rule

Only technical identifiers may intentionally opt into monospace via `type-code`. No general-purpose opt-out back to sans is part of this design.

## Implementation Shape

### In `frontend/src/index.css`

Add typography variables and semantic class definitions for the hierarchy model. Also add base rules for:

- `body`
- headings
- buttons
- form labels where applicable
- `strong`
- `b`

This file should define the actual size, line-height, tracking, and weight values for the hierarchy.

### In `frontend/tailwind.config.js`

Keep only base family plumbing so Tailwind utilities can still refer to configured families when needed. Remove any configuration that encourages components to keep inventing hierarchy locally.

### In JSX components

Replace local utility combinations such as:

- `font-bold`
- `font-semibold`
- `font-medium`
- local heading font-family utilities
- repeated `text-*` plus `font-*` combinations that encode hierarchy

with the semantic classes defined in `index.css`.

## Migration Rules

### Navigation and shell

Navigation brand, nav links, tabs, segmented controls, locale toggles, and shell buttons must adopt semantic typography rather than hand-set weights.

### Cards and reading surfaces

Paper card titles, digest titles, rail labels, stat values, and reading panel copy must map cleanly to `type-card-title`, `type-eyebrow`, `type-body`, `type-meta`, and `type-data`.

### Seeds and subscriptions

These screens currently mix product-style labels with editorial headings. They must be converted to the same hierarchy model so the app feels consistent end to end.

### Settings and technical UI

Settings copy should still use the shared hierarchy. Only actual technical values such as provider model strings or key masks should opt into `type-code`.

### Inline bold removal

All existing `strong`, `b`, and locally bold utility usage should be removed or neutralized unless it expresses one of the approved semantic levels as a separate element.

## Regression Boundaries

Allowed visual changes:

- typography family changes
- text reflow caused by different widths and line heights
- small spacing adjustments required to keep typography readable

Disallowed scope creep:

- changing page structure for unrelated reasons
- redesigning colors, motion, or component architecture
- introducing a second typography exception path

## Risks

### Reflow in dense UI

Switching the entire app to serif may cause more wrapping in buttons, chips, and compact metadata rows.

Mitigation:

- tune `type-button`, `type-eyebrow`, and `type-meta` separately for compact contexts
- validate dense surfaces after migration

### Residual local overrides

Some JSX files may keep explicit weight classes and silently defeat the new system.

Mitigation:

- search and remove explicit font-weight utilities
- add a CSS baseline that neutralizes `strong` and `b`

### Technical fields losing scan contrast

Some model names or API strings may become less readable in serif.

Mitigation:

- route technical identifiers through `type-code`
- keep that exception narrow and intentional

## Verification Plan

### Structural verification

Search the frontend for:

- `font-bold`
- `font-semibold`
- `font-medium`
- `<strong>`
- `<b>`

After migration, remaining matches should be limited to intentional exceptions or non-hierarchy use that has been explicitly reviewed.

### Visual verification

Check these surfaces after the typography migration:

- app shell and navigation
- gacha and draw views
- paper card and digest surfaces
- recommend view
- reading detail modal
- seeds screens
- subscriptions screens
- AI provider settings

### Success criteria

The migration is complete when:

- the same hierarchy level looks the same across the app
- typography can be tuned centrally from the global system
- no inline word-level bolding remains as a visual emphasis mechanism
- monospace remains the only deliberate family exception

## Implementation Sequence

1. Define typography tokens and semantic classes in `frontend/src/index.css`.
2. Reduce `frontend/tailwind.config.js` to family plumbing only.
3. Migrate shared shell elements.
4. Migrate card, digest, reading, recommend, seeds, subscriptions, and settings surfaces.
5. Remove or neutralize residual local weight overrides and inline bold tags.
6. Run structural and visual verification.

## Decision Summary

Approved choices captured in this document:

- Scope: entire PaperDeck frontend
- Control surface: full typography scale, not only weight
- Emphasis policy: no inline word-level bolding
- Visual direction: serif-first across the app
- Architecture: token plus semantic hierarchy classes, not patch-style overrides
