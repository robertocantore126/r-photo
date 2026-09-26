/// <reference lib="webworker" />
/**
 * The engine worker's entry (`docs/ARCHITECTURE.md` §1). The interface starts
 * it from `ui/js/native/bridge.js`; everything it receives goes to the
 * {@link Engine}, and everything the engine says is posted back.
 *
 * This file is the only one that knows it runs in a worker: the engine gets a
 * `post` function, not `self`.
 */
import { CanvasSurface } from "../core/raster/canvas-surface";
import { Engine } from "./engine";
import type { UiToEngine } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const engine = new Engine(
	(frame, transfer) => self.postMessage(frame, transfer ?? []),
	(callback) => self.requestAnimationFrame(callback),
	async (file) => {
		// Photoshop applies a JPEG's EXIF orientation when it opens it; the
		// browser converts an embedded colour profile to sRGB.
		const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
		try {
			return CanvasSurface.fromImage(bitmap);
		} finally {
			bitmap.close();
		}
	},
);

self.addEventListener("message", (event: MessageEvent<UiToEngine>) => engine.handle(event.data));
