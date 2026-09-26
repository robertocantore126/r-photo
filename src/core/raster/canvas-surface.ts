import { BYTES_PER_PIXEL, boundsOf, intersect, isEmpty } from "../surface";
import type { DrawOp, PixelBlock, Rect, Rgba8, Surface, SurfaceFactory, SurfaceFormat } from "../surface";

/**
 * The first Surface implementation (W0-T05): one `OffscreenCanvas` and its 2D
 * context per surface, 8-bit. One of the two places allowed to touch a canvas
 * (ROADMAP §3 rule 1); W10 replaces it with tiles.
 *
 * Known limit of Canvas2D, accepted until W10: the canvas keeps its pixels
 * premultiplied, so a pixel with a low alpha does not read back its exact
 * colour after a write. Opaque pixels round-trip exactly.
 */

/**
 * The pixels behind one or more surfaces. `shared` is set when a snapshot
 * points at the same backing; the next surface that writes copies it first
 * (copy-on-write), so the other holders keep what they had.
 */
interface Backing {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	shared: boolean;
}

function newBacking(width: number, height: number): Backing {
	const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("The browser gave no 2D context for an OffscreenCanvas.");
	}
	return { canvas, context, shared: false };
}

function css(color: Rgba8): string {
	return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

/** A surface backed by one `OffscreenCanvas`. */
export class CanvasSurface implements Surface {
	readonly width: number;
	readonly height: number;
	readonly format: SurfaceFormat;
	private backing: Backing;

	/** A transparent (`rgba8`) or black (`gray8`) surface; `backing` is for snapshots and imports. */
	constructor(width: number, height: number, format: SurfaceFormat, backing?: Backing) {
		this.width = width;
		this.height = height;
		this.format = format;
		this.backing = backing ?? newBacking(width, height);
		if (!backing && format === "gray8") {
			// A gray surface is stored as opaque gray RGBA: black is 0.
			this.fillOpaqueBlack();
		}
	}

	/** A surface holding a decoded image (W0-T07's File ▸ Open), drawn at its natural size. */
	static fromImage(image: ImageBitmap): CanvasSurface {
		const backing = newBacking(image.width, image.height);
		backing.context.drawImage(image, 0, 0);
		return new CanvasSurface(image.width, image.height, "rgba8", backing);
	}

	/** {@inheritDoc Surface.read} */
	read(rect: Rect): PixelBlock {
		const bpp = BYTES_PER_PIXEL[this.format];
		const data = new Uint8ClampedArray(rect.width * rect.height * bpp);
		const inside = intersect(rect, boundsOf(this));
		if (isEmpty(inside)) {
			return { width: rect.width, height: rect.height, format: this.format, data };
		}
		const pixels = this.backing.context.getImageData(inside.x, inside.y, inside.width, inside.height).data;
		for (let row = 0; row < inside.height; row++) {
			const target = ((inside.y - rect.y + row) * rect.width + (inside.x - rect.x)) * bpp;
			const source = row * inside.width * 4;
			if (this.format === "rgba8") {
				data.set(pixels.subarray(source, source + inside.width * 4), target);
			} else {
				for (let i = 0; i < inside.width; i++) {
					data[target + i] = pixels[source + i * 4] ?? 0;
				}
			}
		}
		return { width: rect.width, height: rect.height, format: this.format, data };
	}

	/** {@inheritDoc Surface.write} */
	write(rect: Rect, block: PixelBlock): void {
		if (block.format !== this.format || block.width !== rect.width || block.height !== rect.height) {
			throw new Error("Surface.write: the block does not match the rectangle or the format.");
		}
		const inside = intersect(rect, boundsOf(this));
		if (isEmpty(inside)) {
			return;
		}
		const bpp = BYTES_PER_PIXEL[this.format];
		const image = new ImageData(inside.width, inside.height);
		for (let row = 0; row < inside.height; row++) {
			const source = ((inside.y - rect.y + row) * rect.width + (inside.x - rect.x)) * bpp;
			const target = row * inside.width * 4;
			if (this.format === "rgba8") {
				image.data.set(block.data.subarray(source, source + inside.width * 4), target);
			} else {
				for (let i = 0; i < inside.width; i++) {
					const v = block.data[source + i] ?? 0;
					image.data[target + i * 4] = v;
					image.data[target + i * 4 + 1] = v;
					image.data[target + i * 4 + 2] = v;
					image.data[target + i * 4 + 3] = 255;
				}
			}
		}
		this.writable().putImageData(image, inside.x, inside.y);
	}

	/** {@inheritDoc Surface.draw} */
	draw(op: DrawOp): void {
		const rect = intersect(op.rect ?? boundsOf(this), boundsOf(this));
		if (isEmpty(rect)) {
			return;
		}
		const context = this.writable();
		switch (op.op) {
			case "fill": {
				const color: Rgba8 = this.format === "gray8" ? [op.color[0], op.color[0], op.color[0], op.color[3]] : op.color;
				context.fillStyle = css(color);
				context.fillRect(rect.x, rect.y, rect.width, rect.height);
				return;
			}
			case "clear":
				context.clearRect(rect.x, rect.y, rect.width, rect.height);
				if (this.format === "gray8") {
					context.fillStyle = "#000";
					context.fillRect(rect.x, rect.y, rect.width, rect.height);
				}
				return;
		}
	}

	/** {@inheritDoc Surface.regions} */
	*regions(rect?: Rect): Iterable<Rect> {
		const clipped = intersect(rect ?? boundsOf(this), boundsOf(this));
		if (!isEmpty(clipped)) {
			yield clipped;
		}
	}

	/** {@inheritDoc Surface.snapshot} */
	snapshot(): Surface {
		this.backing.shared = true;
		return new CanvasSurface(this.width, this.height, this.format, this.backing);
	}

	/**
	 * The canvas to draw from, for the viewport's compositor
	 * (`src/engine/viewport.ts`). Read-only use: drawing into it would bypass
	 * copy-on-write.
	 */
	get source(): OffscreenCanvas {
		return this.backing.canvas;
	}

	/** The context to write through, after copying a shared backing. */
	private writable(): OffscreenCanvasRenderingContext2D {
		if (this.backing.shared) {
			const copy = newBacking(this.width, this.height);
			copy.context.drawImage(this.backing.canvas, 0, 0);
			this.backing = copy;
		}
		return this.backing.context;
	}

	private fillOpaqueBlack(): void {
		this.backing.context.fillStyle = "#000";
		this.backing.context.fillRect(0, 0, this.width, this.height);
	}
}

/** Builds {@link CanvasSurface}s: the engine's {@link SurfaceFactory}. */
export const canvasSurfaces: SurfaceFactory = {
	create: (width, height, format) => new CanvasSurface(width, height, format),
};

/**
 * The canvas behind a surface, for drawing it into the viewport, or `null`
 * when the surface is not canvas-backed. Only the viewport should need it.
 */
export function drawableOf(surface: Surface): OffscreenCanvas | null {
	return surface instanceof CanvasSurface ? surface.source : null;
}

/**
 * A layer thumbnail for the Layers panel: the document's frame scaled so its
 * long side is `size` pixels, with the layer's pixels drawn where they sit
 * in it (Photoshop's thumbnails show the layer within the canvas bounds).
 * Straight RGBA bytes.
 */
export function thumbnailOf(surface: Surface, offset: { x: number; y: number }, docWidth: number, docHeight: number, size: number): PixelBlock {
	const scale = Math.min(1, size / Math.max(docWidth, docHeight));
	const width = Math.max(1, Math.round(docWidth * scale));
	const height = Math.max(1, Math.round(docHeight * scale));
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d");
	const image = drawableOf(surface);
	if (context && image) {
		context.imageSmoothingQuality = "high";
		context.drawImage(image, offset.x * scale, offset.y * scale, surface.width * scale, surface.height * scale);
	}
	const data = context ? context.getImageData(0, 0, width, height).data : new Uint8ClampedArray(width * height * 4);
	return { width, height, format: "rgba8", data };
}
