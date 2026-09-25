# Third-party code

What this project takes from other projects, and under which licence. Every
file that stays recognisably theirs keeps its copyright header, taken verbatim
from that project's `LICENSE` (the line is copied when the first file is
ported, so it is never guessed here).

Nothing is vendored yet: W0-T01 is the empty repository. This file is the list
the cards add to.

| Project | Licence | What is taken | Entered |
| --- | --- | --- | --- |
| [BitMappery](https://github.com/igorski/bitmappery) | MIT | The document and layer model, the undo actions, and the starting point of the core's types (`src/model/types/*.ts`, `src/model/factories/document-factory.ts`, `layer-factory.ts`). Its Vue/Vuex interface is **not** used. | W0-T05 |
| [Klecks](https://github.com/Giwayume/klecks) | MIT | The brush engine, as the reference our brushes are ported from. | W2 |
| [miniPaint](https://github.com/viliusle/miniPaint) | MIT | Filter and tool algorithms, ported to TypeScript when a card needs them. | W2, W4 |
| [ag-psd](https://github.com/Agamnentzar/ag-psd) | MIT | PSD / PSB read and write, as a dependency (not copied). | W3 |

## Fotox (this project's own)

Fotox (`../fotox`) is Rob's own work — the same author — so nothing is
"third party" about it, and no MIT header travels with the code that comes
from it. What is used:

- `ui/` — the whole interface (menus, panels, dialogs, tool bar, option bars,
  shortcuts, CSS, icons), copied in W0-T02;
- `docs/PROTOCOL.md` and `ui/js/native/protocol.js` — the message names and
  fields, now typed (`src/engine/protocol.ts`, W0-T03);
- `crates/fx-core` — the blend-mode formulas, the adjustment maths and the
  command names, ported as the specification (W1, W4);
- `docs/BLEND_MODES.md`, `docs/tasks/COVERAGE.md` — the formulas and the
  Photoshop coverage list (W1, and `docs/tasks/COVERAGE.md` renumbered in W1).

The pending Fotox plan documents (`docs/FOTOX-IN-IMMAGINI.html`,
`docs/VERSO-PHOTOSHOP.md`) stay in the Fotox checkout; they are Rob's notes,
not part of this repository.
