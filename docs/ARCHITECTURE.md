# Architecture — Fotox Web (first draft)

> **Draft, Claude, 26 Sep 2026.** It says how the pieces fit, so that W0 can
> start. Details are decided in each milestone's T00 card.

## 1. Threads

```
 main thread (interface)                     engine worker                     job workers
 ────────────────────────                     ─────────────                     ───────────
 Fotox UI (menus, panels, dialogs)  ──JSON──▶  documents, commands, history ──▶ filters, PSD,
 pointer / wheel / keys on #viewport ──────▶   tools, compositor                PatchMatch, AI
 panels, toasts, progress         ◀──JSON──   renders into the viewport's  ◀──  (results as
                                               OffscreenCanvas                   surfaces)
```

- **Main thread**: the interface only. It forwards the viewport's pointer,
  wheel and key events to the engine, and shows what the engine says.
- **Engine worker**:
  - owns the documents, applies commands, keeps the history, runs the tools;
  - composites the visible area into the `OffscreenCanvas` transferred from
    `#viewport` (`canvas.transferControlToOffscreen()`);
  - drawing never waits on the interface, and the interface never waits on
    drawing.
- **Job workers**: anything that takes more than a frame. A job gets
  surfaces (transferable buffers), returns surfaces, and reports progress;
  the engine installs the result as one command. Fotox's recipe R2, the same
  idea.

## 2. Messages

The interface already speaks Fotox's protocol (`fotox/docs/PROTOCOL.md`).
The engine worker answers the same messages, with the same names and fields:
- `hello`, `action`, `command`, `undo` / `redo`, `activate_document`,
  `tool_options`, `set_colors`, `key`, `filter_preview`… from the interface;
- `document_opened`, `layers`, `history`, `view`, `toast`, `progress`,
  `thumbnail`, `tool_info`… from the engine.

`ui/js/native/bridge.js` gets a third transport, next to native (CEF) and
mock: `postMessage` to the worker. The mock engine stays for interface-only
tests.

New messages, because there is no native shell to handle them:

| Message | Fields | Why |
| --- | --- | --- |
| `viewport_canvas` | the transferred `OffscreenCanvas`, `width`, `height`, `dpr` | the engine draws into it |
| `viewport_resized` | `width`, `height`, `dpr` | layout changes |
| `pointer` | `kind`, `x`, `y`, `pressure`, `tilt_x`, `tilt_y`, `buttons`, `modifiers`, `time` | from Pointer Events (pressure and tilt included) |
| `wheel` | `x`, `y`, `dx`, `dy`, `modifiers` | zoom / pan |
| `open_files` | `File` objects (structured-cloned) | open dialog and drop |

## 3. The Surface interface (the rule that keeps W10 possible)

```ts
interface Surface {
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8" | "gray8";         // W10 adds rgba16, rgba32f, gray16
  read(rect: Rect): PixelBlock;               // a copy of a region
  write(rect: Rect, block: PixelBlock): void; // replace a region
  draw(op: DrawOp): void;                     // fill, stroke dab, composite another surface…
  regions(rect?: Rect): Iterable<Rect>;       // work units: today the whole rect, in W10 its tiles
  snapshot(): Surface;                        // copy-on-write, for history
}
```

- W0–W9 implement it with one `OffscreenCanvas` (plus its 2D context) per
  surface. `draw` maps to Canvas2D where Canvas2D does exactly what
  Photoshop does, and to our per-pixel code elsewhere.
- Tools and filters loop over `regions()` and never assume one region. In W10
  the same loops get 256² tiles, and memory stops scaling with the document.
- `snapshot()` is copy-on-write: the history keeps snapshots of what a command
  changed, never whole documents.

## 4. Document model

Ported from BitMappery (`src/model/types`) and brought to Fotox's model
(`fotox/crates/fx-core/src/{document,layer}.rs`), which is closer to
Photoshop's:
- `Document { width, height, ppi, colorProfile, layers (tree), selection?, guides, channels }`;
- `Layer { id, name, kind, visible, opacity, fill, blend, clipped, locks, mask?, offset }`;
  - `kind`: `pixel | group | adjustment | fill | shape | text | smart` (the
    last three arrive in W5 and W8);
  - `pixel` and `mask` are Surfaces;
- `Command`: a discriminated union with the same names as Fotox's
  `fx_core::Command` where one exists (`add_layer`, `set_layer_props`,
  `apply_filter`, `transform`…), so the protocol's `command` message is
  unchanged.

## 5. Rendering

- The compositor walks the layer tree for the **visible rectangle** only, at
  the view's scale:
  - groups with pass-through or isolation;
  - masks, clipping, opacity × fill;
  - the 27 blend modes by Fotox's formulas (`fotox/docs/BLEND_MODES.md`).
- A cache of the flattened layers below the one being edited (Fotox's "hot
  layer", M2-T05) keeps painting fast on deep stacks.
- W10 replaces this with WebGPU on tiles. The WGSL shaders in
  `fotox/crates/fx-render/src/gpu/*.wgsl` are the starting point.

## 6. Files

| Format | Read | Write | When |
| --- | --- | --- | --- |
| PNG, JPEG, WebP, GIF (first frame), BMP | browser decoders (`createImageBitmap`) | `OffscreenCanvas.convertToBlob` | W0 / W1 |
| Project (`.fxw`: zip of JSON + PNGs) | ✔ | ✔ | W1 |
| PSD / PSB | ag-psd | ag-psd | W3 |
| TIFF | utif (or our reader) | our writer | W3 |
| AVIF, HEIC, RAW | where the browser or a wasm decoder allows | — | W4 or later |

## 7. Folder layout (target)

```
ui/                 Fotox's interface (from fotox/ui), moving to TypeScript
src/core/           document, layers, commands, history, Surface (no DOM)
src/core/raster/    the Surface implementations (the only place that touches canvases)
src/engine/         the engine worker: protocol, tools, compositor, view
src/tools/          one file per tool, registered (Lossy Layers' registry pattern)
src/filters/        one file per filter, registered
src/jobs/           job workers (filters, PSD, PatchMatch, AI)
src/io/             file formats
tests/              Vitest (headless: core, tools, filters), Playwright smoke tests
docs/               this folder
```
