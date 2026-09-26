// Fotox — UI ↔ engine message type names.
//
// One source: the names are defined, typed, in src/engine/protocol.ts and
// re-exported here for the interface's JavaScript (W0-T03). Vite serves the
// TypeScript module to these files. Fotox's binary framing is gone: the
// engine is a worker, and messages are posted as objects.

export { UI, ENGINE, UI_LOCAL_ACTION_PREFIXES, isUiLocalAction } from "../../../src/engine/protocol.ts";
