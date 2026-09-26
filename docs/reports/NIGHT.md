# Night of 26 → 27 Sep 2026 — handover

One cloud session (Claude), working alone while Rob slept. Pushing and opening
pull requests **worked**. Nothing was merged; `main` was not touched.

**Where it stopped:** W0 is built up to its acceptance card (W0-T08, Rob's).
W1 was **not started**: W1-T00 point 1 (the compositor) has no "Yes.", and a
milestone with an open decision is not started (decision 5 below). Every later
milestone comes after W1, so nothing else was unblocked.

Branches are **stacked**: each card branch starts from the previous card's
branch, because nothing is merged yet. Every pull request targets `main`, as
asked, so a later pull request also shows the earlier cards' commits until
those are merged. **Merge them in the order of the table** (#1 first). This
file's current copy is on the latest card branch, `task/W0-T07-documents`.

## Cards

| Card | State | Branch | Pull request | Report |
| --- | --- | --- | --- | --- |
| W0-T01 | done before tonight (earlier session); PR opened tonight so the stack merges in order | `task/W0-T01-repository` | [#1](https://github.com/robertocantore126/r-photo/pull/1) | `docs/reports/W0-T01.md` |
| W0-T02 | **done** | `task/W0-T02-interface` | [#2](https://github.com/robertocantore126/r-photo/pull/2) | `docs/reports/W0-T02.md` |
| W0-T03 | **done** | `task/W0-T03-worker` | [#3](https://github.com/robertocantore126/r-photo/pull/3) | `docs/reports/W0-T03.md` |
| W0-T04 | **done** | `task/W0-T04-viewport` | [#4](https://github.com/robertocantore126/r-photo/pull/4) | `docs/reports/W0-T04.md` |
| W0-T05 | **done** | `task/W0-T05-core` | [#5](https://github.com/robertocantore126/r-photo/pull/5) | `docs/reports/W0-T05.md` |
| W0-T06 | **done** | `task/W0-T06-compositor` | [#6](https://github.com/robertocantore126/r-photo/pull/6) | `docs/reports/W0-T06.md` |
| W0-T07 | **done** | `task/W0-T07-documents` | [#7](https://github.com/robertocantore126/r-photo/pull/7) | `docs/reports/W0-T07.md` |
| W0-T08 | not taken: Rob's acceptance run | — | — | — |
| W1 … W12 | **blocked**: W1-T00 point 1 is open (decision 5) | — | — | — |

On every branch `npm run check` and `npm run build` are clean, and every
commit passes `npm run check` on its own.

## What limited the checks

- **No Chrome or Edge on Windows.** A headless Chromium (Linux, Playwright's
  build) was used for every card: console, DOM, screenshots, scripted clicks
  and keys, scale 1 and an emulated 1.5. The scripts stayed in the session's
  scratch space, not in the repository (D-003). Each report has a
  `## Not verified in the browser` section: the File System Access pickers, a
  real drag from Explorer, the clipboard permission prompt, a pen, a real
  HiDPI screen and frame-rate measurements are all Rob's.
- **No access to Fotox.** The cards' "Read first" lists point at `../fotox`
  (`docs/PROTOCOL.md`, `crates/fx-engine/src/view.rs`, `composite.wgsl` …).
  Adding `robertocantore126/fotox` to this session was refused by the session's
  permission policy, and it was not worked around. What Fotox already put in
  this repository (`ui/js/native/*.js`, `canvas.js`) was used instead;
  Photoshop behaviour taken from memory is marked `VERIFY`.

## Decisions only Rob can take

1. **W0-T00 is still unwritten.** ROADMAP §5 questions 1 and 3–7 have
   recommendations but no `D-004…` entries. W0 was built on the cards' own
   assumptions: 8-bit surfaces (Q3, as W0-T05's `format: "rgba8" | "gray8"`
   says), JS → TS file by file (Q4, as `AGENTS.md` says), a Canvas2D
   compositor v0 for W0 only (W0-T06). Q1 is de facto answered: the
   repository is public. (`tsconfig.json` already cites a "D-004" that does
   not exist.)
   *Options*: accept the recommendations as `D-004…D-009`; or change any.
   *Recommendation*: accept them, with Q1 recorded as "public" and Q5 as
   revised by W1-T00.
   *If yes*: nothing to redo in W0.
2. **The interface is still branded Fotox** (window title, logo, "Fotox 1.0"
   in the status bar, About). No card renames it.
   *Options*: a small card of its own (strings only); fold it into W1-T09
   (which touches the menus anyway); keep it.
   *Recommendation*: a small card now, strings only.
3. **BitMappery's header.** W0-T05 took only the shape of BitMappery's
   factories (its model holds `HTMLCanvasElement`s in a flat list, not the one
   `ARCHITECTURE.md` §4 asks for), so no MIT header was added.
   *Options*: leave it (credit in comments and `THIRD_PARTY.md`); add
   BitMappery's header to `src/core/layer.ts` and `document.ts`.
   *Recommendation*: leave it; add the header the day a file is really ported.
4. **When does a JavaScript file of `ui/` move to TypeScript?** `AGENTS.md`
   says "when a card touches it"; the cards list files such as
   `ui/js/canvas.js` and `ui/js/native/bridge.js` as `.js`, and W1-T03 says
   "moved to TS" explicitly where it means it. Tonight a file moved only when
   its card said so; small fixes (`actions.js`, `main.js`) stayed JS.
   *Options*: (a) as tonight — a card moves a file when it says so; (b) any
   touch moves it (then `canvas.js`, `bridge.js`, `actions.js`,
   `documents.js` are owed).
   *Recommendation*: (a), written into `AGENTS.md` with ROADMAP §5 Q4.
5. **W1-T00 point 1 — the compositor (blocks all of W1, and so everything
   after).** The card recommends a WebGPU compositor from W1 (porting Fotox's
   `composite.wgsl`: 27 blend modes, groups, masks, clipping) and revises
   ROADMAP §5 Q5, but the point has no "Yes." (points 2 and 3 do).
   *Options*: (a) WebGPU from W1, as recommended — browsers without WebGPU get
   a message; (b) Canvas2D for the 16 modes it has plus per-pixel code for the
   other 11 (slower, and Soft Light / Linear Dodge's alpha do not match
   Photoshop); (c) CPU compositing in the worker for everything until W10.
   *Recommendation*: (a), as the card argues: it is a port with a CPU twin to
   check against, and W10 moves the same shaders to tiles.
   *If yes*: W1-T01 (the full layer model and commands) can start at once; it
   does not depend on the compositor. **W1-T02 also needs Fotox's
   `composite.wgsl` and `reference.rs`** — see decision 6.
6. **Fotox access for the next session.** The W1 cards are ports of Fotox
   (`BLEND_MODES.md`, `composite.wgsl`, `fx-core`'s commands and history).
   *Options*: attach the fotox repository (read-only) to the next session;
   copy the referenced files into this repository (e.g.
   `docs/reference/fotox/`); let the agent work from Photoshop's behaviour and
   mark everything `VERIFY`.
   *Recommendation*: attach it read-only; W0's `VERIFY` items on the view and
   the protocol can then be checked against `view.rs` and `PROTOCOL.md` too.
7. **W5-T00 point 3** says "Rob picks": **clipper2-js** or
   **polygon-clipping** for path boolean operations (both MIT).
   *Recommendation*: clipper2-js (robust integer arithmetic, and offsetting for
   strokes later). Not urgent (W5).
8. **W9-T00 point 3** says "Rob picks" the AI models (BiRefNet, SAM 2 /
   EfficientSAM, a sky model to find, Real-ESRGAN, a JPEG-artefact model to
   find), each licence to verify. Not urgent (W9); meanwhile W1-T09 labels
   the AI menu items "Planned for W9".

## Known debts, carried forward

These belong to cards not reached tonight; nothing was done about them yet.

- **W1-T09** (`ENGINE_ACTIONS` + "Planned for W<n>" from `COVERAGE.md`): the
  Filter menu's nine unowned entries — Facet, Mezzotint, Flame, Tree, Picture
  Frame, De-Interlace, NTSC Colors, Filter Gallery, AI Enhance — must each end
  up owned by a card or disabled; and the AI ids already in the interface
  (`ai:remove-bg`, `ai:subject`, `ai:sky`, `object-select`) must be tied to
  `COVERAGE.md` (W9-T10, W9-T11) so the rule can see them. Filter Gallery is
  excluded by W4-T00 point 4 ("later if ever"), so it should be disabled
  rather than owned.
- **W4-T02**: the interface's 64 hand-written filter dialog definitions
  overlap with the plan to generate a filter's dialog from its `ParamSpec`;
  its report must name the duplication and say which is the source of truth.
- From W0, each noted in its report: in the Layers panel, row selection
  (`select_layers`), Delete, groups and the Fill field answer "not implemented
  yet" until W1-T01; blend modes, masks and isolated groups in the compositor
  are W1-T02; Save is W1-T07.

## What I would do next

- If decision 5 is "yes" (and Fotox is reachable, decision 6): W1-T01 on
  `task/W1-T01-layers`, off `task/W0-T07-documents` (or off `main` once the
  stack is merged), then W1-T02, T03 … in order, W1-T09 carrying the debts
  above.
- If Rob prefers to merge first: merge #1 … #7 in order, run W0-T08, and
  start W1 from `main`.
