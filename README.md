# Fotox Web (working name)

A Photoshop-like image editor in TypeScript that runs in the browser, in the
spirit of Photopea:
- **Fotox's interface** (menus, panels, dialogs);
- a **core of our own** running in a Web Worker, seeded with
  [BitMappery](https://github.com/igorski/bitmappery)'s model;
- PSD files through [ag-psd](https://github.com/Agamnentzar/ag-psd).

Status: **planning.** No code yet.

- [docs/ROADMAP.md](docs/ROADMAP.md): what we build, in which order, and the
  decisions to take first.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): threads, messages, the
  Surface interface, the document model.
- [docs/tasks/W0.md](docs/tasks/W0.md): the first milestone's cards.
- [docs/DECISIONS.md](docs/DECISIONS.md): the decision log.

Sister project: Fotox (Rust, `../fotox`). Its protocol, blend-mode formulas,
tests and Photoshop coverage list are this project's reference.
