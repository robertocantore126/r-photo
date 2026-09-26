import { createDocument } from "../core/document";
import type { Document } from "../core/document";
import { createPixelLayer } from "../core/layer";
import type { Surface } from "../core/surface";

/**
 * Opening image files (W0-T07): which files, what the document is called,
 * its resolution, and the document itself. Decoding is the browser's
 * (`createImageBitmap`, in the engine worker); this module gets the decoded
 * surface and the file's bytes as arguments, so it knows no DOM and no worker.
 */

/** The formats File ▸ Open takes in W0, by extension. GIF opens its first frame. */
export const OPENABLE: Readonly<Record<string, string>> = Object.freeze({
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	jpe: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	bmp: "image/bmp",
	dib: "image/bmp",
});

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** True when the file looks like one R-photo can open, by type or extension. */
export function isOpenable(name: string, type: string): boolean {
	return Object.values(OPENABLE).includes(type) || extensionOf(name) in OPENABLE;
}

/** Formats that can carry transparency, so the opened layer may not be a Background. */
export function mayBeTransparent(name: string, type: string): boolean {
	return ["image/png", "image/webp", "image/gif"].includes(type) || ["png", "webp", "gif"].includes(extensionOf(name));
}

/**
 * The resolution stored in the file, pixels per inch, or `null` when it says
 * nothing. PNG: the `pHYs` chunk (pixels per metre); JPEG: the JFIF header
 * (dpi or dots per cm). VERIFY: Photoshop reads a JPEG's EXIF resolution
 * too, and falls back to 72 ppi; EXIF is not read here.
 */
export function readResolution(bytes: Uint8Array): number | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const text = (from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));
	const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (png.every((b, i) => bytes[i] === b)) {
		let at = 8;
		while (at + 12 <= bytes.length) {
			const length = view.getUint32(at);
			const type = text(at + 4, at + 8);
			if (type === "pHYs" && length >= 9 && at + 17 <= bytes.length) {
				const perMetre = view.getUint32(at + 8);
				// Unit 1 is the metre; 0 means "aspect ratio only".
				return bytes[at + 16] === 1 && perMetre > 0 ? Math.round(perMetre * 0.0254 * 100) / 100 : null;
			}
			if (type === "IDAT" || type === "IEND") {
				return null;
			}
			at += 12 + length;
		}
		return null;
	}
	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		let at = 2;
		while (at + 4 <= bytes.length && bytes[at] === 0xff) {
			const marker = bytes[at + 1];
			const length = view.getUint16(at + 2);
			// APP0 "JFIF\0": units at +11 (1 dpi, 2 dots per cm), x density at +12.
			if (marker === 0xe0 && at + 14 <= bytes.length && text(at + 4, at + 9) === "JFIF\0") {
				const units = bytes[at + 11];
				const density = view.getUint16(at + 12);
				if (density > 0 && units === 1) {
					return density;
				}
				if (density > 0 && units === 2) {
					return Math.round(density * 2.54 * 100) / 100;
				}
				return null;
			}
			// Start of scan: no header after this.
			if (marker === 0xda) {
				return null;
			}
			at += 2 + length;
		}
	}
	return null;
}

/**
 * The document for an opened image: one layer holding it. Photoshop calls it
 * "Background" when the image is opaque and "Layer 0" when it has
 * transparency (a PNG with alpha). Resolution defaults to 72 ppi.
 */
export function documentFromImage(surface: Surface, transparent: boolean, ppi: number | null): Document {
	const doc = createDocument(surface.width, surface.height, ppi ?? 72);
	const id = doc.nextLayerId++;
	const layer = transparent ? createPixelLayer(id, "Layer 0", surface) : createPixelLayer(id, "Background", surface, true);
	doc.layers.push(layer);
	doc.activeLayer = id;
	return doc;
}

/** The file-picker filter for {@link OPENABLE}: MIME type → extensions. */
export function openableAccept(): Record<string, string[]> {
	const accept: Record<string, string[]> = {};
	for (const [ext, mime] of Object.entries(OPENABLE)) {
		(accept[mime] ??= []).push(`.${ext}`);
	}
	return accept;
}
