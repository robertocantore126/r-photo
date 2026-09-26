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
}

/** The viewport: its canvas, its size, and the frame loop. */
export class Viewport implements ViewportTarget {
	private canvas: OffscreenCanvas | null = null;
	private context: OffscreenCanvasRenderingContext2D | null = null;
	private background = "#282828";
	private scheduled = false;
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

	/** {@inheritDoc ViewportTarget.fillRect} */
	fillRect(x: number, y: number, width: number, height: number, color: string): void {
		if (!this.context) {
			return;
		}
		this.context.fillStyle = color;
		this.context.fillRect(x, y, width, height);
	}
}
