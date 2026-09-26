# Decisions

One line per decision, never edited afterwards (a later decision replaces an
earlier one by saying so). Numbers are never reused.

| Id | Decision | Why | Date |
| --- | --- | --- | --- |
| D-000 | A Photopea-like editor in TypeScript, with Fotox's interface and our own core seeded from BitMappery; out-of-core tiles, 16-bit and WebGPU postponed to W10 behind the Surface interface. | Rob, 26 Sep 2026: development speed first; Fotox (Rust) spent most of its effort on the huge-document requirement. | 2026-09-26 |
| D-001 | The project is called **R-photo** (folder `r-photo`). | Rob. | 2026-09-26 |
| D-002 | **Browser only**: no desktop build. Files through the File System Access API where available, else downloads; large storage through OPFS (W10). | Rob; Photopea's model, nothing to install. | 2026-09-26 |
| D-003 | **No automated tests during development.** Each card is checked with `npm run check` (typecheck, lint, interface data) and by hand in the browser; the test suite is milestone W12, at the end. | Rob: speed first. The core stays DOM-free and command-based so the tests are cheap to add then. | 2026-09-26 |
| D-004 | **Fotox's interface (`ui/`) moves to TypeScript file by file, when a card says so** (or its files list names the `.ts`); a small fix to a `.js` file keeps it JavaScript. New code is TypeScript. (ROADMAP §5 question 4.) | Rob, W0-T00. Converting on any touch would drag large files (`canvas.js`, `bridge.js`) into cards about something else. | 2026-09-26 |
| D-005 | The GitHub repository is **public**. (ROADMAP §5 question 1; the recommendation was private.) | Rob, W0-T00: it already is. | 2026-09-26 |
| D-006 | **8-bit surfaces** (`rgba8`, `gray8`) in W0–W9; the Surface interface stays ready for 16-bit in W10. (ROADMAP §5 question 3.) | Rob, W0-T00: what Canvas2D and BitMappery give, and W0 is built on it. | 2026-09-26 |
| D-007 | **The project file is a zip** of `document.json` + one PNG per surface; W1-T00 point 2 fixes the details (`.rph`, fflate, a composite PNG, `"version": 1`). It becomes tile-based in W10. (ROADMAP §5 question 6.) | Rob, W0-T00: simple and inspectable. | 2026-09-26 |
| D-008 | **Fotox (Rust) is paused** after its M6 is merged; its documents and code (`../fotox`, public) are this project's reference. (ROADMAP §5 question 7.) | Rob, W0-T00. | 2026-09-26 |
| D-009 | **The interface keeps Fotox's branding** (title, logo, status bar, About) for now; no card renames it. | Rob, 26 Sep 2026. | 2026-09-26 |

Open: ROADMAP §5 question 5, the compositor (W1-T00 point 1).
