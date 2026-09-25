# Decisions

One line per decision, never edited afterwards (a later decision replaces an
earlier one by saying so). Numbers are never reused.

| Id | Decision | Why | Date |
| --- | --- | --- | --- |
| D-000 | A Photopea-like editor in TypeScript, with Fotox's interface and our own core seeded from BitMappery; out-of-core tiles, 16-bit and WebGPU postponed to W10 behind the Surface interface. | Rob, 26 Sep 2026: development speed first; Fotox (Rust) spent most of its effort on the huge-document requirement. | 2026-09-26 |
| D-001 | The project is called **R-photo** (folder `r-photo`). | Rob. | 2026-09-26 |
| D-002 | **Browser only**: no desktop build. Files through the File System Access API where available, else downloads; large storage through OPFS (W10). | Rob; Photopea's model, nothing to install. | 2026-09-26 |
| D-003 | **No automated tests during development.** Each card is checked with `npm run check` (typecheck, lint, interface data) and by hand in the browser; the test suite is milestone W12, at the end. | Rob: speed first. The core stays DOM-free and command-based so the tests are cheap to add then. | 2026-09-26 |

Open until W0-T00: questions 1 and 3–7 in `docs/ROADMAP.md` §5.
