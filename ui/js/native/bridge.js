// Fotox — the bridge between the UI and the engine.
//
// Two transports (W0-T03):
//   - the engine worker (src/engine/worker.ts), the default: messages are
//     posted to it, and its replies come back through `receive`;
//   - the mock engine (./mock-engine.js), with `?mock` in the URL: the
//     interface alone, as Fotox runs in a plain browser.
// Fotox's third, the CEF shell (`window.sendNativeMessage`, binary frames), is
// gone: R-photo runs in the browser only (D-002).
//
// Usage:
//   import * as bridge from "./native/bridge.js";
//   bridge.init();                          // once, at startup
//   bridge.send({ type: "hello", ui_version: "…" });
//   bridge.on("toast", (msg, payload) => …);

import * as mockEngine from "./mock-engine.js";

const useMock = new URLSearchParams(location.search).has("mock");

/**
 * True when a real engine answers (the worker), false with `?mock`.
 *
 * The name is Fotox's, where it meant "inside the app": the interface checks
 * it wherever the engine, not the interface, owns something (the documents,
 * the view, the Layers and History panels). That is exactly what the worker
 * is, so the ~40 call sites keep their meaning without being touched.
 */
export const isNative = !useMock;

const listeners = new Map(); // message type → Set of callbacks
let started = false;
let worker = null;

/**
 * Start the bridge: mark `<body class="engine">` (the viewport's layout) and
 * start the engine worker, unless `?mock`. Safe to call more than once.
 */
export function init() {
  if (started) return;
  started = true;
  if (!isNative) return;
  document.body.classList.add("engine");
  worker = new Worker(new URL("../../../src/engine/worker.ts", import.meta.url), { type: "module", name: "r-photo engine" });
  worker.addEventListener("message", (event) => receive(event.data));
  worker.addEventListener("error", (event) => {
    console.error("r-photo bridge: the engine worker failed:", event.message || event);
  });
}

/**
 * Send a message (an object with a `type` field) to the engine. `transfer`
 * lists buffers or canvases to hand over instead of copying (W0-T04's
 * viewport canvas, W0-T07's files).
 */
export function send(message, transfer = []) {
  if (worker) {
    worker.postMessage(message, transfer);
    return;
  }
  // Mock: replies go through the same `receive` path, asynchronously like the
  // real thing.
  for (const reply of mockEngine.handle(message)) {
    setTimeout(() => receive({ message: reply }), 0);
  }
}

/**
 * Call `fn(message, payload)` for every incoming message of `type`.
 * Returns a function that removes the listener.
 */
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

// One frame from the engine: `{ message, payload? }` (src/engine/protocol.ts,
// `EngineFrame`). `payload` is a Uint8Array for the messages that carry pixels.
function receive(frame) {
  const message = frame && frame.message;
  if (!message || typeof message.type !== "string") {
    console.error("r-photo bridge: dropping a malformed message:", frame);
    return;
  }
  const handlers = listeners.get(message.type);
  if (!handlers || handlers.size === 0) {
    console.warn(`r-photo bridge: no handler for "${message.type}"`);
    return;
  }
  const payload = frame.payload || new Uint8Array(0);
  for (const fn of handlers) fn(message, payload);
}
