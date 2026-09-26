import type { View } from "./view";
import type { ViewportTarget } from "./viewport";

/**
 * A temporary stand-in document for W0-T04 (the card allows one "until
 * W0-T07"): 4000 × 3000 pixels, the exit criteria's size, drawn straight
 * from its description so pan and zoom can be tried before documents exist.
 * Deleted by W0-T07, which opens real images.
 */
export const TEST_PATTERN = { width: 4000, height: 3000 } as const;

const BLOCK = 250;
const LINE = 50;

/** Draw the visible part of the pattern: coloured 250-pixel blocks, and a 1-pixel grid every 50 pixels. */
export function drawTestPattern(target: ViewportTarget, view: View): void {
	target.clear();
	const origin = view.origin();
	const z = view.zoom;
	// The visible part of the document, in document pixels.
	const x0 = Math.max(0, Math.floor(-origin.x / z));
	const y0 = Math.max(0, Math.floor(-origin.y / z));
	const x1 = Math.min(TEST_PATTERN.width, Math.ceil((target.width - origin.x) / z));
	const y1 = Math.min(TEST_PATTERN.height, Math.ceil((target.height - origin.y) / z));
	const rect = (x: number, y: number, w: number, h: number, color: string): void => {
		// Whole device pixels at both edges: no seams between blocks.
		const left = Math.round(origin.x + x * z);
		const top = Math.round(origin.y + y * z);
		target.fillRect(left, top, Math.round(origin.x + (x + w) * z) - left, Math.round(origin.y + (y + h) * z) - top, color);
	};
	for (let by = Math.floor(y0 / BLOCK) * BLOCK; by < y1; by += BLOCK) {
		for (let bx = Math.floor(x0 / BLOCK) * BLOCK; bx < x1; bx += BLOCK) {
			const hue = Math.round((bx / TEST_PATTERN.width) * 300);
			const light = 35 + Math.round((by / TEST_PATTERN.height) * 40);
			const odd = (bx / BLOCK + by / BLOCK) % 2 === 1;
			rect(bx, by, BLOCK, BLOCK, `hsl(${hue} ${odd ? 70 : 45}% ${light}%)`);
		}
	}
	// The grid only where its lines are at least 3 device pixels apart.
	if (LINE * z >= 3) {
		for (let x = Math.ceil(x0 / LINE) * LINE; x < x1; x += LINE) {
			rect(x, y0, 1, y1 - y0, x % BLOCK === 0 ? "#ffffff" : "rgba(255,255,255,0.35)");
		}
		for (let y = Math.ceil(y0 / LINE) * LINE; y < y1; y += LINE) {
			rect(x0, y, x1 - x0, 1, y % BLOCK === 0 ? "#ffffff" : "rgba(255,255,255,0.35)");
		}
	}
}
