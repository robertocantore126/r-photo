/**
 * The Surface interface (`docs/ARCHITECTURE.md` §3, ROADMAP §3 rule 1).
 *
 * A layer's pixels, a mask, a selection: every image the core holds is a
 * `Surface`. Code outside `src/core/raster/` reads and writes regions of it
 * and runs operations on it; it never holds a canvas or a whole layer's
 * `ImageData`. That is what lets W10 swap the implementation (tiles, 16-bit,
 * OPFS) without touching the tools and filters.
 *
 * No DOM here: this file is types and small helpers.
 */

/** A rectangle in pixels. `width` and `height` may be 0 (empty). */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * How a surface stores a pixel. `rgba8`: straight (not premultiplied) RGBA,
 * 8 bits a channel. `gray8`: one 8-bit value (masks, selections, alpha
 * channels). W10 adds `rgba16`, `rgba32f` and `gray16`.
 */
export type SurfaceFormat = "rgba8" | "gray8";

/** Bytes per pixel of each format. */
export const BYTES_PER_PIXEL: Readonly<Record<SurfaceFormat, number>> = Object.freeze({ rgba8: 4, gray8: 1 });

/**
 * A copy of a region's pixels: `width × height` pixels, row after row, in
 * `format` ({@link BYTES_PER_PIXEL} bytes each).
 */
export interface PixelBlock {
	readonly width: number;
	readonly height: number;
	readonly format: SurfaceFormat;
	readonly data: Uint8ClampedArray;
}

/** A colour for drawing into a surface: straight RGBA, 0‥255. A `gray8` surface uses the red channel. */
export type Rgba8 = readonly [number, number, number, number];

/**
 * An operation a surface runs on itself. W0 has two; the tools and filters
 * add theirs (brush dabs, compositing another surface…) in later cards.
 *
 * - `fill`: paint `color` over `rect` (the whole surface when absent), in
 *   Photoshop's Normal mode at 100 % (the colour's own alpha blends over what
 *   is there).
 * - `clear`: make `rect` fully transparent (black for `gray8`).
 */
export type DrawOp =
	| { op: "fill"; rect?: Rect; color: Rgba8 }
	| { op: "clear"; rect?: Rect };

/** The image store every layer, mask and selection uses (`docs/ARCHITECTURE.md` §3). */
export interface Surface {
	readonly width: number;
	readonly height: number;
	readonly format: SurfaceFormat;
	/** A copy of the pixels in `rect`; pixels outside the surface read as 0. */
	read(rect: Rect): PixelBlock;
	/** Replace the pixels in `rect` with `block` (same size and format); what falls outside the surface is dropped. */
	write(rect: Rect, block: PixelBlock): void;
	/** Run an operation on the surface. */
	draw(op: DrawOp): void;
	/**
	 * The work units covering `rect` (the whole surface when absent), clipped
	 * to the surface. Today one rectangle; in W10 its tiles. Tools and filters
	 * loop over these and never assume there is only one.
	 */
	regions(rect?: Rect): Iterable<Rect>;
	/**
	 * A copy that shares the pixels until one side writes (copy-on-write).
	 * Cheap: the history keeps these, not duplicates.
	 */
	snapshot(): Surface;
}

/**
 * Makes surfaces. The core never builds one itself (that would need a
 * canvas): the engine passes a factory in, and W12's tests can pass another.
 */
export interface SurfaceFactory {
	create(width: number, height: number, format: SurfaceFormat): Surface;
}

/** The surface's whole area as a rectangle. */
export function boundsOf(surface: { width: number; height: number }): Rect {
	return { x: 0, y: 0, width: surface.width, height: surface.height };
}

/** The overlap of two rectangles (empty, not negative, when they miss). */
export function intersect(a: Rect, b: Rect): Rect {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** True when the rectangle covers no pixel. */
export function isEmpty(rect: Rect): boolean {
	return rect.width <= 0 || rect.height <= 0;
}

/** True for a rectangle of whole, non-negative sizes and whole coordinates. */
export function isWholeRect(rect: Rect): boolean {
	return [rect.x, rect.y, rect.width, rect.height].every(Number.isInteger) && rect.width >= 0 && rect.height >= 0;
}

/**
 * True when every pixel of an `rgba8` surface is opaque (a `gray8` surface
 * always is). Reads region by region, so it works on any implementation.
 */
export function isOpaque(surface: Surface): boolean {
	if (surface.format !== "rgba8") {
		return true;
	}
	for (const region of surface.regions()) {
		// Band by band: a whole 4000 × 3000 region would be one 48 MB copy.
		const band = Math.max(1, Math.floor(4_000_000 / Math.max(1, region.width)));
		for (let y = region.y; y < region.y + region.height; y += band) {
			const rect = { x: region.x, y, width: region.width, height: Math.min(band, region.y + region.height - y) };
			const data = surface.read(rect).data;
			for (let i = 3; i < data.length; i += 4) {
				if (data[i] !== 255) {
					return false;
				}
			}
		}
	}
	return true;
}
