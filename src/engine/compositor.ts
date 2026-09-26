import type { Document } from "../core/document";
import type { Layer } from "../core/layer";
import { intersect, isEmpty } from "../core/surface";
import type { Rect } from "../core/surface";
import type { View } from "./view";
import type { ViewportTarget } from "./viewport";

/**
 * Compositor v0 (W0-T06): draws the visible part of a document into the
 * viewport, at the view's scale.
 *
 * - The workspace's background outside the document; Photoshop's
 *   transparency grid under it.
 * - The pixel layers bottom to top, Normal blend, with opacity × fill.
 * - Nearest-pixel scaling at 100 % and above (sharp squares), filtered
 *   below (Fotox's rule).
 *
 * Only what W0 needs: blend modes, masks, clipping and isolated groups are
 * W1-T02's compositor (WebGPU if W1-T00 says so). A pan redraws the whole
 * viewport, which is fine at W0's sizes.
 */
export function composite(target: ViewportTarget, doc: Document, view: View): void {
	target.clear();
	const origin = view.origin();
	const zoom = view.zoom;
	// The document's rectangle on screen, and the part of it inside the viewport.
	const docOnScreen: Rect = {
		x: origin.x,
		y: origin.y,
		width: Math.round(origin.x + doc.width * zoom) - origin.x,
		height: Math.round(origin.y + doc.height * zoom) - origin.y,
	};
	const visibleOnScreen = intersect(docOnScreen, { x: 0, y: 0, width: target.width, height: target.height });
	if (isEmpty(visibleOnScreen)) {
		return;
	}
	target.checkerboard(visibleOnScreen, origin.x, origin.y);

	// The visible part in document pixels, widened to whole pixels.
	const x0 = Math.floor((visibleOnScreen.x - origin.x) / zoom);
	const y0 = Math.floor((visibleOnScreen.y - origin.y) / zoom);
	const x1 = Math.ceil((visibleOnScreen.x + visibleOnScreen.width - origin.x) / zoom);
	const y1 = Math.ceil((visibleOnScreen.y + visibleOnScreen.height - origin.y) / zoom);
	const visible = intersect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, { x: 0, y: 0, width: doc.width, height: doc.height });
	const smooth = zoom < 1;

	const drawLayers = (layers: Layer[], opacity: number): void => {
		for (const layer of layers) {
			if (!layer.visible) {
				continue;
			}
			if (layer.kind === "group") {
				// VERIFY (W1-T02): a group's opacity multiplies into its layers
				// here, which is right only for pass-through groups of Normal
				// layers that do not overlap.
				drawLayers(layer.children, opacity * layer.opacity);
				continue;
			}
			if (layer.kind !== "pixel") {
				// Fill, adjustment, shape, text and smart layers are drawn from W1 on.
				continue;
			}
			// Every blend mode is drawn as Normal until W1-T02.
			const surface = layer.pixels;
			const inDocument: Rect = { x: layer.offset.x, y: layer.offset.y, width: surface.width, height: surface.height };
			const part = intersect(inDocument, visible);
			if (isEmpty(part)) {
				continue;
			}
			const source: Rect = { x: part.x - layer.offset.x, y: part.y - layer.offset.y, width: part.width, height: part.height };
			// Both edges rounded the same way as the document's, so layers
			// line up with each other and with the grid.
			const left = Math.round(origin.x + part.x * zoom);
			const top = Math.round(origin.y + part.y * zoom);
			const screen: Rect = {
				x: left,
				y: top,
				width: Math.round(origin.x + (part.x + part.width) * zoom) - left,
				height: Math.round(origin.y + (part.y + part.height) * zoom) - top,
			};
			target.drawSurface(surface, source, screen, opacity * layer.opacity * layer.fill, smooth);
		}
	};
	drawLayers(doc.layers, 1);
}
