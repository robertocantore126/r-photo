/**
 * The view of one document: where it sits in the viewport and at what zoom.
 *
 * Fotox's `fx-engine/src/view.rs` was the card's reference, but it was not at
 * hand (see `docs/reports/W0-T04.md`); this is Photoshop's behaviour as far as
 * it is known, with the guesses marked `VERIFY`.
 *
 * Units:
 * - **zoom** is device pixels per document pixel. 1 is Photoshop's 100 %: one
 *   image pixel on one screen pixel, also at 125 / 150 % Windows scaling;
 * - the **viewport** is measured in device pixels;
 * - the **centre** is the document point shown at the middle of the viewport.
 *
 * No DOM, no worker: plain numbers in, plain numbers out.
 */

/**
 * Photoshop's zoom presets, in percent: what Zoom In / Zoom Out (Ctrl + / −)
 * and a Zoom tool click step through.
 *
 * VERIFY (W12): the list is Photoshop's as remembered (the steps below 100 %
 * are 2/3, 1/2, 1/3, 1/4 … of the one above); Photoshop CC's maximum is
 * 12 800 %.
 */
export const ZOOM_STEPS: readonly number[] = Object.freeze([
	0.78, 1.04, 1.56, 2.08, 3.13, 4.17, 6.25, 8.33, 12.5, 16.67, 25, 33.33, 50, 66.67,
	100, 200, 300, 400, 500, 600, 700, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800,
]);

/** The smallest zoom, as a factor. VERIFY: Photoshop goes lower on huge documents. */
export const MIN_ZOOM = 0.0078;

/** The largest zoom, as a factor (Photoshop's 12 800 %). */
export const MAX_ZOOM = 128;

/**
 * How much one wheel pixel zooms: `factor = exp(-dy × WHEEL_ZOOM_RATE)`, so a
 * mouse notch (≈ 100 device pixels) is about × 1.2.
 * VERIFY: Photoshop's Alt + wheel rate.
 */
const WHEEL_ZOOM_RATE = 0.0018;

/** Compare zooms with a tolerance, so 66.67 % counts as the 66.67 % step. */
const EPSILON = 1e-4;

/** A point in device pixels or document pixels, depending on the method. */
export interface Point {
	x: number;
	y: number;
}

/**
 * A document's view: zoom, centre, and the viewport it is shown in. Every
 * change clamps the centre (see {@link View.clamp}) and returns whether
 * anything moved, so the caller redraws only when it did.
 */
export class View {
	/** Device pixels per document pixel. */
	zoom = 1;
	/** The document point at the middle of the viewport, x. */
	centerX = 0;
	/** The document point at the middle of the viewport, y. */
	centerY = 0;

	/** The document's width, pixels. */
	docWidth: number;
	/** The document's height, pixels. */
	docHeight: number;
	/** The viewport's width, device pixels. */
	viewWidth: number;
	/** The viewport's height, device pixels. */
	viewHeight: number;

	/** A view of a `docWidth × docHeight` document in a `viewWidth × viewHeight` viewport, fitted as Photoshop opens a file. */
	constructor(docWidth: number, docHeight: number, viewWidth: number, viewHeight: number) {
		this.docWidth = docWidth;
		this.docHeight = docHeight;
		this.viewWidth = viewWidth;
		this.viewHeight = viewHeight;
		this.openFit();
	}

	/**
	 * The zoom a document opens at: the largest preset that shows it whole,
	 * never above 100 %. VERIFY: Photoshop's rule when opening a file.
	 */
	openFit(): boolean {
		const fit = Math.min(1, this.fitZoom());
		const step = [...ZOOM_STEPS].reverse().find((s) => s / 100 <= fit + EPSILON);
		return this.set(step === undefined ? fit : step / 100, this.docWidth / 2, this.docHeight / 2);
	}

	/**
	 * View ▸ Fit on Screen (Ctrl+0): the whole document, as large as the
	 * viewport allows, also above 100 %. VERIFY: Photoshop's margin (none here).
	 */
	fit(): boolean {
		return this.set(this.fitZoom(), this.docWidth / 2, this.docHeight / 2);
	}

	/**
	 * View ▸ Fill Screen: the document covers the viewport; the other axis
	 * overflows. VERIFY.
	 */
	fill(): boolean {
		const fill = Math.max(this.viewWidth / this.docWidth, this.viewHeight / this.docHeight);
		return this.set(fill, this.docWidth / 2, this.docHeight / 2);
	}

	/** View ▸ 100 % (Ctrl+1), about the viewport's centre. */
	actual(): boolean {
		return this.zoomTo(1);
	}

	/**
	 * View ▸ Print Size: the document at its physical size on a screen of
	 * `screenPpi` pixels per inch. VERIFY: Photoshop takes the screen's
	 * resolution from its preferences (72 ppi on Windows by default).
	 */
	printSize(docPpi: number, screenPpi = 72): boolean {
		return this.zoomTo(screenPpi / docPpi);
	}

	/**
	 * Zoom In (Ctrl + +): the next preset, about `at` (device pixels), or the
	 * viewport's centre. VERIFY: Photoshop zooms about the centre from the keyboard.
	 */
	zoomIn(at?: Point): boolean {
		const next = ZOOM_STEPS.find((s) => s / 100 > this.zoom + EPSILON);
		return next === undefined ? false : this.zoomAbout(next / 100, at);
	}

	/** Zoom Out (Ctrl + −): the preset below, about `at` or the centre. */
	zoomOut(at?: Point): boolean {
		const previous = [...ZOOM_STEPS].reverse().find((s) => s / 100 < this.zoom - EPSILON);
		return previous === undefined ? false : this.zoomAbout(previous / 100, at);
	}

	/** Continuous zoom by a wheel delta (device pixels), keeping the point under the pointer still. */
	wheelZoom(dy: number, at: Point): boolean {
		return this.zoomAbout(this.zoom * Math.exp(-dy * WHEEL_ZOOM_RATE), at);
	}

	/** An exact zoom (a factor) about the viewport's centre: the zoom field. */
	zoomTo(zoom: number): boolean {
		return this.zoomAbout(zoom);
	}

	/**
	 * Change the zoom so the document point under `at` (device pixels) stays
	 * under it; without `at`, about the viewport's centre.
	 */
	zoomAbout(zoom: number, at?: Point): boolean {
		const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
		if (!at) {
			return this.set(z, this.centerX, this.centerY);
		}
		const anchor = this.toDocument(at);
		return this.set(
			z,
			anchor.x - (at.x - this.viewWidth / 2) / z,
			anchor.y - (at.y - this.viewHeight / 2) / z,
		);
	}

	/** Move the document by `dx`, `dy` device pixels (a Hand drag, the wheel). */
	panBy(dx: number, dy: number): boolean {
		return this.set(this.zoom, this.centerX - dx / this.zoom, this.centerY - dy / this.zoom);
	}

	/** The viewport changed size: the centre stays where it is. */
	resize(viewWidth: number, viewHeight: number): boolean {
		this.viewWidth = viewWidth;
		this.viewHeight = viewHeight;
		this.set(this.zoom, this.centerX, this.centerY);
		// The viewport itself changed, so there is always something to redraw.
		return true;
	}

	/** The document changed size (Image Size, Canvas Size): fit it again. */
	resizeDocument(docWidth: number, docHeight: number): boolean {
		this.docWidth = docWidth;
		this.docHeight = docHeight;
		return this.fit();
	}

	/** A device point → the document point under it. */
	toDocument(p: Point): Point {
		const origin = this.origin();
		return { x: (p.x - origin.x) / this.zoom, y: (p.y - origin.y) / this.zoom };
	}

	/** A document point → where it is in the viewport, device pixels. */
	toDevice(p: Point): Point {
		const origin = this.origin();
		return { x: origin.x + p.x * this.zoom, y: origin.y + p.y * this.zoom };
	}

	/**
	 * Where the document's top-left corner is in the viewport, device pixels.
	 * Rounded to a whole pixel, so that at 100 % and above every image pixel
	 * covers whole screen pixels (sharp squares, no seams).
	 */
	origin(): Point {
		return {
			x: Math.round(this.viewWidth / 2 - this.centerX * this.zoom),
			y: Math.round(this.viewHeight / 2 - this.centerY * this.zoom),
		};
	}

	/** The zoom at which the whole document just fits the viewport. */
	fitZoom(): number {
		if (this.docWidth <= 0 || this.docHeight <= 0 || this.viewWidth <= 0 || this.viewHeight <= 0) {
			return 1;
		}
		return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(this.viewWidth / this.docWidth, this.viewHeight / this.docHeight)));
	}

	/**
	 * Keep the document in view, per axis: when it is smaller than the
	 * viewport it stays centred; when it is larger, its edges cannot come
	 * inside the viewport's. VERIFY: Photoshop's "Overscroll" preference
	 * (off here) lets the image go further.
	 */
	clamp(zoom: number, centerX: number, centerY: number): Point {
		const axis = (center: number, doc: number, view: number): number => {
			const half = view / 2 / zoom;
			if (doc * zoom <= view) {
				return doc / 2;
			}
			return Math.min(doc - half, Math.max(half, center));
		};
		return { x: axis(centerX, this.docWidth, this.viewWidth), y: axis(centerY, this.docHeight, this.viewHeight) };
	}

	private set(zoom: number, centerX: number, centerY: number): boolean {
		const c = this.clamp(zoom, centerX, centerY);
		const changed = zoom !== this.zoom || c.x !== this.centerX || c.y !== this.centerY;
		this.zoom = zoom;
		this.centerX = c.x;
		this.centerY = c.y;
		return changed;
	}
}
