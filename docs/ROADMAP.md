# Roadmap — R-photo

> **First draft, Claude, 26 Sep 2026.** Written after Rob's decision: a
> Photopea-like editor in TypeScript, with **Fotox's interface**, **our own
> core**, and **BitMappery** as the starting code for the core. Everything here
> is a proposal until Rob approves it; each milestone opens with a T00 card of
> decisions, as in Fotox.

## 1. What we are building

A Photoshop-like image editor that runs **in the browser only** (D-002),
fast to develop:
- TypeScript everywhere, instant reload with Vite;
- no native build;
- the interface Fotox already has (menus, panels, dialogs, tool bar, option
  bars);
- a core written by us, seeded with BitMappery's model and operations.

The model is **Photopea**: one program, in the browser, that opens PSD files
and does most of what Photoshop does on ordinary documents.

What we deliberately postpone:
- documents of tens of thousands of pixels, out-of-core storage, 16-bit on
  the GPU. They come in milestone **W10**, behind an interface the whole core
  uses from day one (§3, rule 1);
- **automated tests** (D-003). During development each card is checked by
  the typecheck and the linter only; the test suite is written in **W12**, at
  the end.

## 2. What comes from where

| Part | Source | Licence | How |
| --- | --- | --- | --- |
| Interface (menus, panels, dialogs, tool bar, option bars, shortcuts, CSS, icons) | **Fotox** `ui/` (plain JS, ~6 500 lines + data) | Rob's own | Copied, then moved to TypeScript file by file. The `mock-engine.js` is replaced by the real engine in a worker (W0). |
| UI ↔ engine messages | **Fotox** `docs/PROTOCOL.md` | Rob's own | The same JSON messages, plus the pointer / wheel / viewport messages the native shell used to handle. |
| Document model, layer model, undo actions, blend-mode formulas, filters in a worker, PSD import idea | **BitMappery** (`src/model`, `src/rendering/operations`, `src/workers`, `src/definitions`) | MIT | Start of the core: types and operations are ported into our core behind the Surface interface (§3). Its Vue/Vuex interface is **not** used. |
| Brush engine | **Klecks** (`src/app/script/klecks/brushes`) | MIT | Ported in W2 as the reference for our brushes. |
| Filters, tools as reference | **miniPaint** (`src/js/modules/effects`, `src/js/tools`) | MIT | Algorithms ported to TypeScript when a card needs them. |
| PSD / PSB read and write | **ag-psd** | MIT | A dependency (W3). |
| Tool / filter registries, param specs, segmentation worker | **Lossy Layers** | Rob's own | Patterns and code reused (W0, W9). |
| Blend-mode formulas, adjustment maths, test cases, the Photoshop coverage list | **Fotox** `docs/BLEND_MODES.md`, `crates/fx-core`, `docs/tasks/COVERAGE.md` | Rob's own | Ported as the specification and as test vectors. |

Every file taken from an MIT project keeps its copyright header, and
`THIRD_PARTY.md` lists the projects (W0-T01).

## 3. Rules that make the later milestones possible

1. **Pixels only through the Surface interface.** A layer's pixels, a mask,
   a selection are `Surface`s. Code outside `core/raster` reads and writes
   regions of them and runs operations on them; it never holds a canvas or an
   `ImageData` of a whole layer.
   - The first implementation is simple: one `OffscreenCanvas` per surface,
     8-bit.
   - W10 replaces it with tiles, 16-bit and browser storage (OPFS) **without
     touching the tools and filters**.
   - A lint rule enforces it.
2. **Every change to a document is a command** (Fotox's D-010). Commands are
   plain serialisable data, applied by one function, and undoable. This gives
   undo, macros (W11) and scripting for free, makes a command recorded live
   equal to its replay, and lets W12 test everything headless.
3. **The engine never runs on the interface thread.**
   - The core runs in a Web Worker and draws into an `OffscreenCanvas` that
     belongs to the viewport.
   - Heavy work (filters, PSD, AI) runs in further workers.
   - The interface never waits.
4. **Photoshop's behaviour is the specification.** Names, shortcuts, history
   labels and formulas are Photoshop's. Where a formula is a guess it is
   marked `VERIFY` and checked against Photoshop through PSD files (W12).
5. **Checks, not tests, during development** (D-003). Every commit passes
   `npm run check` = the typecheck (`tsc --noEmit`, strict), the linter
   (`eslint`, with the Surface rule) and Fotox's interface data checker
   (`check-data.mjs`). No unit or end-to-end tests are written until W12; a
   card's result is checked by trying it in the browser.
6. **Code that is easy to test later.** The core (`src/core`, `src/tools`,
   `src/filters`, `src/io`) never touches the DOM or the worker's globals;
   it takes its inputs as arguments. That is what makes W12 cheap.

## 4. Milestones

Each milestone ends with Rob's acceptance run: a checklist of things to try
in the browser. Sizes: a "card" is 0.5–2 days of agent work.

| | Milestone | What you can do at the end | Cards |
| --- | --- | --- | --- |
| **W0** | Foundation | Open the app in the browser: Fotox's interface, a real engine in a worker, a document you can pan and zoom, New / Open PNG-JPEG-WebP, one layer | 8 |
| **W1** | Layers and history | The full layer stack:<br>• pixel layers, groups, masks, clipping;<br>• the 27 blend modes (Photoshop's), opacity / fill;<br>• the Layers and History panels live, unlimited undo;<br>• save / reopen a project file, export PNG / JPEG / WebP | 10 |
| **W2** | Selections and painting | • Move, Marquee, Lasso, Magic Wand, Eyedropper;<br>• Brush / Pencil / Eraser with pen pressure (Klecks' engine);<br>• Paint Bucket, Gradient;<br>• clipboard and drag-and-drop as layers;<br>• Free Transform, Crop, Image / Canvas Size | 12 |
| **W3** | PSD | Open and save PSD / PSB with layers, groups, masks, blend modes, text as pixels, adjustment layers where supported (ag-psd) | 6 |
| **W4** | Adjustments and filters | • the 16 adjustments as adjustment layers and as Image ▸ Adjustments;<br>• filters with live preview in workers (Blur family, Sharpen, Noise, Stylize, Distort, Render, Other);<br>• Fade | 10 |
| **W5** | Type, shapes and paths | Type tool (horizontal / vertical, character and paragraph panels), shape layers, Pen tools, Paths panel, vector masks | 10 |
| **W6** | Retouching tools | Clone / Pattern Stamp, Healing / Spot Healing / Patch, Dodge / Burn / Sponge, Blur / Sharpen / Smudge, History Brush, Color Replacement, Red Eye, Background / Magic Eraser, Mixer Brush, brush presets and ABR import | 11 |
| **W7** | Channels and selections | Channels panel, Quick Mask, Save / Load Selection, Color Range, Grow / Similar, Transform Selection, Select and Mask, Quick Selection, Magnetic Lasso, Perspective Crop, measurement tools | 10 |
| **W8** | Styles and Smart Objects | The ten layer styles and Blend If, Smart Objects and Smart Filters, Layer Comps, Artboards, Slices | 9 |
| **W9** | Content-aware and AI | • Content-Aware Fill / Move / Scale (PatchMatch in a worker / WebAssembly);<br>• Liquify, Puppet Warp, Perspective Warp, Vanishing Point;<br>• Select Subject, Remove Background, Object Selection (onnxruntime-web on WebGPU);<br>• Generative Fill through a local ComfyUI | 12 |
| **W10** | Scale | Surfaces become tiles (256²), 16-bit and 32-bit float, out-of-core storage in the browser (OPFS), WebGPU compositing on the visible tiles only, lazy open of big TIFF / PSB | 9 |
| **W11** | Automation and plugins | Actions (record / replay the commands), batch processing on a folder (File System Access API), scripting, a plugin interface (WebAssembly and JS modules) | 7 |
| **W12** | Tests | The test suite written at the end (D-003):<br>• unit tests of the core (Vitest, headless);<br>• the Photoshop comparison on PSD files (every `VERIFY`);<br>• Playwright smoke tests of the interface;<br>• performance measurements | 8 |

`docs/tasks/COVERAGE.md` (to be copied from Fotox's plan branch and
renumbered) maps every Photoshop tool and feature Rob listed on 26 Sep 2026
to these milestones.

### Why this order

- **W0–W2** make it usable for daily work as early as possible.
- **W3 comes early on purpose.** In TypeScript PSD is cheap (ag-psd); it
  opens real work files early, and it gives W12 Photoshop's own files as the
  reference. In Fotox it was the thing that kept slipping.
- **W4–W8** follow Photoshop's menus by how often they are used.
- **W9** needs the preview and worker infrastructure of W4 and the
  selections of W7.
- **W10** is the scale work Rob decided to postpone. It is a milestone of its
  own, not scattered repairs, only because of §3 rule 1.
- **W11**: automation is worth most when the commands are complete.
- **W12** last, as Rob decided: the tests are written once the code has
  settled. Rules 5 and 6 of §3 keep that affordable.

## 5. Decisions for Rob before W0

Answered on 26 Sep 2026 (`docs/DECISIONS.md`): the name is **R-photo**
(D-001), the app is **browser only** (D-002), and **tests come at the end**
(D-003).

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | The GitHub repository: public or private? | **Private** until there is something to show |
| 3 | Pixel depth in W0–W9 | **8-bit** (what Canvas2D and BitMappery give), with the Surface interface ready for 16-bit in W10 |
| 4 | Keep the interface in plain JS, or move it to TypeScript? | **Move it gradually**: new code in TS, old files converted when touched |
| 5 | Compositing in W0–W9 | **Our own compositor** in the worker: Canvas2D where its composite operations match Photoshop's formulas, our code (ported from Fotox's formulas) for the others. WebGPU arrives in W10 |
| 6 | Project file format | A **zip**: `document.json` (layers, commands' parameters) + one PNG per surface. Simple, inspectable, and it becomes tile-based in W10 |
| 7 | Fotox (Rust) | **Paused** after M6 is merged. Its documents (architecture, protocol, blend modes, coverage, M7–M13 plans) are the reference for this project |

## 6. How we work

- Same rules as Fotox, adapted to TypeScript (`AGENTS.md`, written in W0-T01):
  - one card per branch;
  - a report per card in `docs/reports/`, saying what was checked by hand in
    the browser;
  - `npm run check` (typecheck, lint, interface data) before every commit;
  - no tests until W12.
- Commits use the configured identity (the GitHub noreply address).
- Agents (Claude, DeepSeek) take cards from `docs/tasks/W*.md`. Rob does the
  acceptance runs.
