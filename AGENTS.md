# R-photo — how we work

A Photoshop-like image editor that runs in the browser only (D-002), with
**Fotox's interface** and **our own core**. Read `docs/ROADMAP.md` (what we
build, in which order), `docs/ARCHITECTURE.md` (threads, messages, the Surface
interface, the document model) and `docs/DECISIONS.md` (the log) before a card.
Sister project: Fotox (Rust) in `../fotox` — its protocol, blend-mode formulas
and Photoshop coverage list are this project's reference.

## The cards

- One card per branch: `task/W<n>-T<nn>-<name>` (`task/W0-T01-repository`).
- A report per card in `docs/reports/W<n>-T<nn>.md`: what was built, what
  changed from the card, and **what was tried in the browser** and what was
  seen. A card without a report is not finished.
- Cards are `docs/tasks/W*.md`. `T00` cards are Rob's: they answer the open
  questions in `docs/DECISIONS.md`; an agent does not take them.
- Rob does the acceptance runs (`W<n>-T99`, or the last card of a milestone).
- Commits are small and logical, in the configured git identity
  (`rob126 <73017206+robertocantore126@users.noreply.github.com>`), and each
  one says *why*, not only what. No `git push` unless Rob asks.
- Do not commit the other drafts in `docs/tasks/` or Rob's own files.

## Checks

- **`npm run check` before every commit**: `npm run typecheck` (`tsc --noEmit`,
  strict, `noUncheckedIndexedAccess`), `npm run lint` (`eslint .`) and, from
  W0-T02, `node ui/tools/check-data.mjs` (Fotox's interface data checker).
  `npm run check` must be clean; there is no "warning budget".
- **No unit or end-to-end tests until W12** (D-003). During development a card
  is checked in the browser (Chrome or Edge on Windows) and the report says
  what was tried. The core is written so those tests are cheap then: no DOM,
  no worker globals, commands as data (rules 2 and 5 below).
- `npm run dev` serves the app; `npm run build` writes static files to `dist/`
  that must work from anywhere (D-002).

## Rules that are not negotiable

From `docs/ROADMAP.md` §3; the linter enforces 1 and 5.

1. **Pixels only through the Surface interface.** Canvases, `ImageData`,
   `getContext`, `getImageData` and `OffscreenCanvas` are allowed **only** in
   `src/core/raster/` and in `src/engine/viewport.ts` (`eslint.config.js`
   restricts them everywhere else). Everything else reads and writes regions
   and runs operations; W10 replaces the implementation without touching the
   tools.
2. **Every change to a document is a command**: plain serialisable data,
   applied by one function, validated before anything changes, undoable.
3. **The engine never runs on the interface thread.** The core lives in the
   worker; heavy work goes to job workers; the interface never waits.
4. **Photoshop's behaviour is the specification**: names, shortcuts, history
   labels, formulas. A guess is marked `VERIFY` in the code and listed in the
   report, to be checked against Photoshop in W12.
5. `src/core`, `src/tools`, `src/filters` and `src/io` **never touch the DOM**
   or the worker's globals (`document`, `window`, `self`, `navigator`): inputs
   are arguments. The lint rule keeps it that way; `src/core/raster/` is the
   only exception under `src/core`, because it *is* the canvas.

## TypeScript and JavaScript

- New code is TypeScript. Fotox's interface (`ui/`) stays plain JavaScript for
  now: `allowJs` is on, `checkJs` is off, and a file moves to TypeScript when a
  card touches it (ROADMAP §5 question 4).
- No `any` without a comment saying why it is one; no `// @ts-ignore`
  (use `@ts-expect-error` with a reason, or fix the type). The linter warns on
  `any`.
- Timers, cycles and ownership: prefer passing data through the command and
  the message types rather than reaching across modules.
- Every exported symbol and every message type gets a doc comment saying what
  it is for. Comments say *why*; the code says what.

## Style

- Tabs, as Fotox. `npm run check` covers formatting where it matters (the
  linter), so there is no separate formatter to fight.
- Names: Photoshop's (`levels`, `clipping`, `fill`, `layers`) so the interface,
  the protocol and the reports read the same as the reference.
- Errors: a command that cannot be applied returns why, in one sentence the UI
  can toast; the document is left untouched (all or nothing).
