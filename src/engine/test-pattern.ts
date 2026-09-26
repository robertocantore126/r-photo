import { apply } from "../core/command";
import type { Command } from "../core/command";
import { createDocument } from "../core/document";
import type { Document } from "../core/document";
import type { SurfaceFactory } from "../core/surface";

/**
 * A temporary stand-in document (W0-T04's "temporary pattern until W0-T07"),
 * built with the core's own commands since W0-T06 so the compositor draws it
 * like any document: 4000 × 3000 pixels (the exit criteria's size), three
 * layers.
 *
 * - "Blocks": coloured 250-pixel blocks over the left two thirds; the right
 *   third is transparent.
 * - "Band": a red band across the middle at 50 % opacity: where it crosses the
 *   transparent third, the transparency grid shows through it.
 * - "Pixels": 64 × 64 pixels of noise in the middle, to see sharp squares at
 *   400 % and smoothing at 25 %.
 *
 * Shown with `?pattern`. Deleted by W0-T07, which opens real documents.
 */
export const TEST_PATTERN = { width: 4000, height: 3000 } as const;

const BLOCK = 250;

/** Build the test document. */
export function buildTestDocument(surfaces: SurfaceFactory): Document {
	const doc = createDocument(TEST_PATTERN.width, TEST_PATTERN.height);
	const run = (command: Command): void => {
		const outcome = apply(doc, command, { surfaces });
		if (!outcome.ok) {
			throw new Error(`test document: ${outcome.error}`);
		}
	};
	const c16 = (r: number, g: number, b: number, a = 255): [number, number, number, number] => [r * 257, g * 257, b * 257, a * 257];

	run({ op: "add_layer", name: "Blocks" });
	const blocks = doc.activeLayer ?? 0;
	for (let y = 0; y < TEST_PATTERN.height; y += BLOCK) {
		for (let x = 0; x < (TEST_PATTERN.width * 2) / 3 - BLOCK / 2; x += BLOCK) {
			const hue = x / TEST_PATTERN.width;
			const odd = (x / BLOCK + y / BLOCK) % 2 === 1;
			const light = 90 + Math.round((y / TEST_PATTERN.height) * 120);
			run({
				op: "fill_layer",
				layer: { id: blocks },
				color: c16(Math.round(light * (1 - hue)), odd ? light : Math.round(light * 0.6), Math.round(light * hue * 1.4) % 256),
				rect: { x, y, width: BLOCK, height: BLOCK },
			});
		}
	}

	run({ op: "add_layer", name: "Band" });
	const band = doc.activeLayer ?? 0;
	run({ op: "fill_layer", layer: { id: band }, color: c16(230, 30, 40), rect: { x: 0, y: 1250, width: TEST_PATTERN.width, height: 500 } });
	run({ op: "set_layer_props", layer: { id: band }, props: { opacity: 0.5 } });

	run({ op: "add_layer", name: "Pixels" });
	const pixels = doc.layers.find((l) => l.id === doc.activeLayer);
	if (pixels?.kind === "pixel") {
		const size = 64;
		const data = new Uint8ClampedArray(size * size * 4);
		let seed = 12345;
		for (let i = 0; i < size * size; i++) {
			// A small linear congruential generator: the same noise every time.
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			data[i * 4] = seed & 255;
			data[i * 4 + 1] = (seed >> 8) & 255;
			data[i * 4 + 2] = (seed >> 16) & 255;
			data[i * 4 + 3] = 255;
		}
		pixels.pixels.write({ x: 1968, y: 1468, width: size, height: size }, { width: size, height: size, format: "rgba8", data });
	}
	return doc;
}
