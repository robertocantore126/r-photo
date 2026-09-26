/**
 * The viewport's canvas, on the engine's side.
 *
 * The interface transfers `#viewport`'s `<canvas>` to the worker
 * (`viewport_canvas`); this module owns it from then on. It is one of the two
 * places allowed to touch a canvas (ROADMAP §3 rule 1, `eslint.config.js`):
 * the rest of the engine draws through {@link ViewportTarget}, never through a
 * 2D context.
 *
 * Frames: nothing is drawn until something asks ({@link Viewport.requestDraw}),
 * and then once, on the next animation frame. An idle document costs nothing.
 */

/** Ask for `callback` on the next animation frame (the worker's `requestAnimationFrame`). */
export type FrameScheduler = (callback: () => void) => void;

import { drawableOf } from "../core/raster/canvas-surface";
import type { Rect, Surface } from "../core/surface";

/**
 * Photoshop's transparency grid (Preferences ▸ Transparency & Gamut): the
 * default "Light" colours and "Medium" size, in **screen** pixels, so the
 * squares keep their size at every zoom. VERIFY (W12): the exact greys and
 * size, and whether the size follows the display scale.
 */
const CHECKER = { size: 8, light: "#ffffff", dark: "#cccccc" } as const;

/**
 * What the engine may do to the viewport while a frame is drawn. Device
 * pixels, origin at the viewport's top-left.
 */
export interface ViewportTarget {
	/** Width, device pixels. */
	readonly width: number;
	/** Height, device pixels. */
	readonly height: number;
	/** Paint the whole viewport with the workspace's background (no document). */
	clear(): void;
	/** Fill a rectangle with a CSS colour. */
	fillRect(x: number, y: number, width: number, height: number, color: string): void;
	/**
	 * Paint Photoshop's transparency grid over `rect`, its squares aligned
	 * to (`anchorX`, `anchorY`) so the grid moves with the document.
	 */
	checkerboard(rect: Rect, anchorX: number, anchorY: number): void;
	/**
	 * Draw the `source` region of a surface into the `target` rectangle,
	 * Normal blend at `opacity` (0‥1). `smooth`: filtered scaling (below
	 * 100 %) rather than nearest pixels.
	 */
	drawSurface(surface: Surface, source: Rect, target: Rect, opacity: number, smooth: boolean): void;
}

/** The viewport: its canvas, its size, and the frame loop. */
export class Viewport implements ViewportTarget {
	private canvas: OffscreenCanvas | null = null;
	private context: OffscreenCanvasRenderingContext2D | null = null;
	private background = "#282828";
	private scheduled = false;
	private checker: CanvasPattern | null = null;
	private readonly schedule: FrameScheduler;

	/** Device pixels per CSS pixel. */
	dpr = 1;

	/** Called on every frame that was asked for, with the viewport to draw into. */
	onDraw: (target: ViewportTarget) => void = (target) => target.clear();

	/** A viewport that draws on the frames `schedule` gives it. */
	constructor(schedule: FrameScheduler) {
		this.schedule = schedule;
	}

	/** Width, device pixels (0 until the canvas arrives). */
	get width(): number {
		return this.canvas ? this.canvas.width : 0;
	}

	/** Height, device pixels. */
	get height(): number {
		return this.canvas ? this.canvas.height : 0;
	}

	/** True once the interface has handed its canvas over. */
	get attached(): boolean {
		return this.context !== null;
	}

	/** Take the transferred canvas. `background` is the workspace's CSS colour. */
	attach(canvas: OffscreenCanvas, width: number, height: number, dpr: number, background: string): void {
		this.canvas = canvas;
		// `alpha: false`: the viewport is opaque, which lets the browser skip
		// blending it with the page.
		this.context = canvas.getContext("2d", { alpha: false });
		if (background) {
			this.background = background;
		}
		this.resize(width, height, dpr);
	}

	/** The viewport changed size (device pixels) or scale. */
	resize(width: number, height: number, dpr: number): void {
		this.dpr = dpr;
		if (this.canvas) {
			// Setting a canvas's size clears it even when the size is the
			// same, so only a real change touches it.
			const w = Math.max(1, Math.round(width));
			const h = Math.max(1, Math.round(height));
			if (this.canvas.width !== w) {
				this.canvas.width = w;
			}
			if (this.canvas.height !== h) {
				this.canvas.height = h;
			}
		}
		this.requestDraw();
	}

	/** Something visible changed: draw on the next frame (once, however often this is called). */
	requestDraw(): void {
		if (this.scheduled || !this.context) {
			return;
		}
		this.scheduled = true;
		this.schedule(() => {
			this.scheduled = false;
			if (this.context) {
				this.onDraw(this);
			}
		});
	}

	/** {@inheritDoc ViewportTarget.clear} */
	clear(): void {
		this.fillRect(0, 0, this.width, this.height, this.background);
	}

	/** {@inheritDoc ViewportTarget.checkerboard} */
	checkerboard(rect: Rect, anchorX: number, anchorY: number): void {
		const context = this.context;
		if (!context) {
			return;
		}
		if (!this.checker) {
			const size = CHECKER.size;
			const tile = new OffscreenCanvas(size * 2, size * 2);
			const t = tile.getContext("2d");
			if (!t) {
				return;
			}
			t.fillStyle = CHECKER.light;
			t.fillRect(0, 0, size * 2, size * 2);
			t.fillStyle = CHECKER.dark;
			t.fillRect(size, 0, size, size);
			t.fillRect(0, size, size, size);
			this.checker = context.createPattern(tile, "repeat");
		}
		if (!this.checker) {
			return;
		}
		this.checker.setTransform(new DOMMatrix([1, 0, 0, 1, anchorX, anchorY]));
		context.fillStyle = this.checker;
		context.fillRect(rect.x, rect.y, rect.width, rect.height);
	}

	/** {@inheritDoc ViewportTarget.drawSurface} */
	drawSurface(surface: Surface, source: Rect, target: Rect, opacity: number, smooth: boolean): void {
		const context = this.context;
		const image = drawableOf(surface);
		if (!context || !image || source.width <= 0 || source.height <= 0 || opacity <= 0) {
			return;
		}
		context.globalAlpha = opacity;
		context.imageSmoothingEnabled = smooth;
		context.imageSmoothingQuality = "high";
		context.drawImage(image, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
		context.globalAlpha = 1;
	}

	/** {@inheritDoc ViewportTarget.fillRect} */
	fillRect(x: number, y: number, width: number, height: number, color: string): void {
		if (!this.context) {
			return;
		}
		this.context.fillStyle = color;
		this.context.fillRect(x, y, width, height);
	}
}

/**
 * A document-sized drawing target for File ▸ Export (W0-T07): the compositor
 * draws into it at 100 %, exactly as into the viewport, and it encodes the
 * result. The transparency grid is not drawn; transparent pixels stay
 * transparent, or are flattened onto `matte`.
 */
export class ExportTarget implements ViewportTarget {
	private readonly canvas: OffscreenCanvas;
	private readonly context: OffscreenCanvasRenderingContext2D;
	private readonly matte: string | null;

	/** A `width × height` target; `matte` is the colour under transparent pixels, or `null`. */
	constructor(width: number, height: number, matte: string | null) {
		this.canvas = new OffscreenCanvas(width, height);
		const context = this.canvas.getContext("2d");
		if (!context) {
			throw new Error("The browser gave no 2D context for the export.");
		}
		this.context = context;
		this.matte = matte;
	}

	/** Width, pixels. */
	get width(): number {
		return this.canvas.width;
	}

	/** Height, pixels. */
	get height(): number {
		return this.canvas.height;
	}

	/** {@inheritDoc ViewportTarget.clear} */
	clear(): void {
		this.context.clearRect(0, 0, this.width, this.height);
		if (this.matte) {
			this.fillRect(0, 0, this.width, this.height, this.matte);
		}
	}

	/** {@inheritDoc ViewportTarget.fillRect} */
	fillRect(x: number, y: number, width: number, height: number, color: string): void {
		this.context.fillStyle = color;
		this.context.fillRect(x, y, width, height);
	}

	/** The grid is on screen only: an export has none. */
	checkerboard(): void {
		// Nothing to draw.
	}

	/** {@inheritDoc ViewportTarget.drawSurface} */
	drawSurface(surface: Surface, source: Rect, target: Rect, opacity: number, smooth: boolean): void {
		const image = drawableOf(surface);
		if (!image || opacity <= 0) {
			return;
		}
		this.context.globalAlpha = opacity;
		this.context.imageSmoothingEnabled = smooth;
		this.context.drawImage(image, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
		this.context.globalAlpha = 1;
	}

	/** Encode what was drawn. `quality` is 0‥1 (JPEG, WebP). */
	encode(mime: string, quality: number): Promise<Blob> {
		return this.canvas.convertToBlob({ type: mime, quality });
	}
}
