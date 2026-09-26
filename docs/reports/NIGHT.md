# Night of 26 → 27 Sep 2026 — handover

One cloud session (Claude), working alone while Rob slept. Pushing and opening
pull requests **worked**. Nothing was merged; `main` was not touched.

Branches are **stacked**: each card branch starts from the previous card's
branch, because nothing is merged yet. Every pull request targets `main`, as
asked, so a later pull request also shows the earlier cards' commits until
those are merged. Merge them in the order of the table.

This file is updated after every card; the copy on the **latest** card branch
is the current one.

## Cards

| Card | State | Branch | Pull request | Report |
| --- | --- | --- | --- | --- |
| W0-T01 | done before tonight (earlier session); PR opened tonight so the stack can be merged in order | `task/W0-T01-repository` | [#1](https://github.com/robertocantore126/r-photo/pull/1) | `docs/reports/W0-T01.md` |
| W0-T02 | **done** | `task/W0-T02-interface` | [#2](https://github.com/robertocantore126/r-photo/pull/2) | `docs/reports/W0-T02.md` |
| W0-T03 | **done** | `task/W0-T03-worker` | [#3](https://github.com/robertocantore126/r-photo/pull/3) | `docs/reports/W0-T03.md` |
| W0-T04 | **done** | `task/W0-T04-viewport` | see GitHub | `docs/reports/W0-T04.md` |

## What limited the checks

- **No Chrome or Edge on Windows.** A headless Chromium (Linux) was available
  and was used for every card: console, DOM, screenshots. Each report has a
  `## Not verified in the browser` section with what is left for Rob.
- **No access to Fotox.** The cards' "Read first" lists point at `../fotox`
  (`docs/PROTOCOL.md`, `crates/fx-engine/src/view.rs`, `composite.wgsl` …).
  Adding `robertocantore126/fotox` to this session was refused by the session's
  permission policy, and it was not worked around. What Fotox already put in
  this repository (`ui/js/native/protocol.js`, `mock-engine.js`, `canvas.js`,
  `layers-panel.js` …) was used instead; anything taken from memory of
  Photoshop rather than from Fotox is marked `VERIFY`.

## Decisions only Rob can take

1. **W0-T00 is still unwritten.** ROADMAP §5 questions 1 and 3–7 have
   recommendations but no `D-004…` entries. W0 was built on the cards' own
   assumptions: 8-bit surfaces (Q3, as W0-T05's `format: "rgba8" | "gray8"`
   says), JS → TS file by file (Q4, as `AGENTS.md` says), a Canvas2D
   compositor v0 for W0 only (W0-T06). Q1 is de facto answered: the
   repository is public.
   *Options*: accept the recommendations as `D-004…D-009`; or change any.
   *Recommendation*: accept them, with Q1 recorded as "public" (it already is)
   and Q5 as revised by W1-T00.
   *If yes*: nothing to redo in W0.
2. **The interface is still branded Fotox** (window title, logo, "Fotox 1.0"
   in the status bar, the demo document "FOTOX STUDIO"). No card renames it.
   *Options*: rename now in a small card of its own; rename when the demo
   document is removed (W0-T07 replaces it with real documents); keep it.
   *Recommendation*: a small card after W0, strings only.
3. **When does a JavaScript file of `ui/` move to TypeScript?** `AGENTS.md`
   says "when a card touches it"; the cards themselves list files such as
   `ui/js/canvas.js` and `ui/js/native/bridge.js` as `.js`, and W1-T03 says
   "moved to TS" explicitly where it means it. Tonight a file moved only when
   its card said so; one-line fixes (`actions.js`, `main.js`) stayed JS.
   *Options*: (a) as tonight — a card moves a file when it says so; (b) any
   touch moves it (then `canvas.js`, `bridge.js`, `actions.js` are owed).
   *Recommendation*: (a), written into `AGENTS.md` with ROADMAP §5 Q4.
