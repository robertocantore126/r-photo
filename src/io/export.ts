/**
 * File ▸ Export As PNG / JPEG / WebP (W0-T07): the choices, as data. The
 * encoding itself is the browser's (`OffscreenCanvas.convertToBlob`, in the
 * engine), so this module stays free of canvases and globals.
 */

/** The formats W0 exports. */
export type ExportFormat = "png" | "jpg" | "webp";

/** How to encode one export. */
export interface ExportSettings {
	format: ExportFormat;
	mime: string;
	extension: string;
	/** 0‥1 for JPEG and WebP; ignored for PNG. */
	quality: number;
	/**
	 * The colour transparent pixels are flattened onto, or `null` to keep
	 * transparency. JPEG has no alpha. VERIFY: Photoshop's Export As uses
	 * white for a JPEG of a document with transparency.
	 */
	matte: string | null;
}

/** True when `value` names an export format. */
export function isExportFormat(value: unknown): value is ExportFormat {
	return value === "png" || value === "jpg" || value === "webp";
}

/**
 * The settings for `format` at Photoshop's `quality` (0‥100, the Export As
 * slider; default 90 as in Fotox's dialog).
 */
export function exportSettings(format: ExportFormat, quality = 90): ExportSettings {
	const q = Math.min(100, Math.max(0, Number.isFinite(quality) ? quality : 90)) / 100;
	switch (format) {
		case "png":
			return { format, mime: "image/png", extension: "png", quality: 1, matte: null };
		case "jpg":
			return { format, mime: "image/jpeg", extension: "jpg", quality: q, matte: "#ffffff" };
		case "webp":
			return { format, mime: "image/webp", extension: "webp", quality: q, matte: null };
	}
}

/** The suggested file name: the document's name without its extension, plus the format's. */
export function exportName(documentName: string, settings: ExportSettings): string {
	const base = documentName.replace(/\.[a-z0-9]{1,5}$/i, "") || "Untitled";
	return `${base}.${settings.extension}`;
}
