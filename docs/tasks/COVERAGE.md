# Coverage — every Photoshop tool and feature on Rob's list

> **Draft, Claude, 26 Sep 2026.** Rob's list of 26 Sep 2026, mapped to the
> R-photo card that builds each item. Nothing is built yet: this is the plan.
> Fotox's version of this list (with Fotox's status) is
> `fotox-plan/docs/tasks/COVERAGE.md`.

## Toolbox

| Category | Tool | Card |
| --- | --- | --- |
| Move & transform | Move Tool | W2-T05 |
| | Artboard Tool | W8-T07 |
| Selection | Rectangular, Elliptical, Single Row, Single Column Marquee | W2-T03 |
| Lasso | Lasso, Polygonal Lasso | W2-T03 |
| | Magnetic Lasso | W7-T07 |
| Object selection | Object Selection | W9-T11 |
| | Quick Selection | W7-T06 |
| | Magic Wand | W2-T04 |
| Crop & slice | Crop | W2-T10 |
| | Perspective Crop | W7-T09 |
| | Slice, Slice Select | W8-T08 |
| Eyedropper / measurement | Eyedropper | W2-T07 |
| | Color Sampler, Ruler, Note, Count | W7-T08 |
| Retouching | Spot Healing Brush, Healing Brush, Patch | W6-T02 (content-aware modes: W9-T02, W9-T03) |
| | Content-Aware Move | W9-T03 |
| | Red Eye | W6-T07 |
| Painting | Brush, Pencil | W2-T06 (tips, dynamics, presets: W6-T01) |
| | Color Replacement | W6-T07 |
| | Mixer Brush | W6-T09 |
| Clone | Clone Stamp | W6-T02 |
| | Pattern Stamp | W6-T05 |
| History painting | History Brush, Art History Brush | W6-T06 |
| Eraser | Eraser | W2-T06 |
| | Background Eraser, Magic Eraser | W6-T08 |
| Gradient / fill | Gradient, Paint Bucket | W2-T08 |
| Blur / sharpen / smudge | Blur, Sharpen, Smudge | W6-T04 |
| Dodge / burn | Dodge, Burn, Sponge | W6-T03 |
| Pen / paths | Pen, Freeform Pen, Curvature Pen, Add / Delete Anchor Point, Convert Point | W5-T02 |
| Path selection | Path Selection, Direct Selection | W5-T03 |
| Shapes | Rectangle, Ellipse, Triangle, Polygon, Line, Custom Shape | W5-T04 |
| Text | Horizontal Type | W5-T06 |
| | Vertical Type, Horizontal / Vertical Type Mask | W5-T07 |
| Navigation | Hand, Zoom | W0-T04, W2-T11 |
| | Rotate View | W2-T11 |

## Transform

| Feature | Card |
| --- | --- |
| Free Transform, Scale, Rotate, Skew, Distort, Perspective, Warp | W2-T10 (lossless on Smart Objects: W8-T03) |
| Content-Aware Scale | W9-T04 |
| Puppet Warp | W9-T06 |

## Selection-related

| Feature | Card |
| --- | --- |
| Select Subject, Remove Background, Sky Select | W9-T10 |
| Color Range | W7-T03 |
| Focus Area | W7-T04 |
| Select and Mask | W7-T05 |
| Modify Selection | W2-T02 |
| Grow, Similar, Transform Selection | W7-T02 |

## Retouching / image manipulation

| Feature | Card |
| --- | --- |
| Content-Aware Fill | W9-T01, W9-T02 |
| Generative Fill, Generative Expand | W9-T13 (through Rob's local ComfyUI) |
| Neural Filters | W9-T12 (a subset: Super Zoom, JPEG artefacts, Colorize) |
| Liquify | W9-T05 |
| Vanishing Point | W9-T08 |
| Perspective Warp | W9-T07 |
| Puppet Warp | W9-T06 |

## Colour / tonal

| Feature | Card |
| --- | --- |
| Brightness/Contrast, Levels, Curves, Exposure, Vibrance, Hue/Saturation, Color Balance, Black & White, Photo Filter, Channel Mixer, Color Lookup, Invert, Posterize, Threshold, Gradient Map, Selective Color | W4-T01 |

## Layer-related

| Feature | Card |
| --- | --- |
| Layer Mask, Clipping Mask, Blend Modes, Fill / Opacity | W1-T01, W1-T02, W1-T05 |
| Adjustment Layers | W1-T01 (the layer kind), W4-T01 (the adjustments) |
| Layer Styles | W8-T01, W8-T02 |
| Smart Objects | W8-T03, W8-T04 |
| Smart Filters | W8-T05 |
| Layer Comps | W8-T06 |

## Not on the list, needed by it

| What | Card |
| --- | --- |
| File ▸ New, Open, Export | W0-T07 |
| Project file, autosave | W1-T07 |
| PSD / PSB / TIFF | W3 |
| Filters (Blur, Sharpen, Noise, Distort, Stylize, Pixelate, Render, Other) | W4-T02 … T08 |
| Paths panel, vector masks | W5-T01, W5-T05 |
| Channels, Quick Mask, Save / Load Selection | W7-T01 |
| Patterns | W6-T05 |
| Guides, grid, snapping | W2-T11 |
| Huge documents, 16 / 32-bit | W10 |
| Actions, batch, scripting, plugins | W11 |
| Tests | W12 |
