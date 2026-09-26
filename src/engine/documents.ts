import { apply, parseCommand } from "../core/command";
import type { Command } from "../core/command";
import { layersTopDown } from "../core/document";
import type { Document } from "../core/document";
import { History } from "../core/history";
import type { Layer } from "../core/layer";
import { thumbnailOf } from "../core/raster/canvas-surface";
import { isOpaque } from "../core/surface";
import type { Surface, SurfaceFactory } from "../core/surface";
import { exportName, exportSettings } from "../io/export";
import type { ExportFormat } from "../io/export";
import { documentFromImage, isOpenable, mayBeTransparent, readResolution } from "../io/open";
import { composite } from "./compositor";
import { ENGINE } from "./protocol";
import type { DocId, DocumentInfo, EngineToUi, LayerInfo, Rgba16 } from "./protocol";
import { View } from "./view";
import { ExportTarget } from "./viewport";
import type { ViewportTarget } from "./viewport";

/**
 * The open documents (W0-T07): File ▸ New and Open, the tabs, closing with
 * "save changes?", commands and the history, export. The engine owns them;
 * the interface only shows what the messages say (`document_opened`,
 * `active_document`, `layers`, `history`, `view`).
 */

/** One open document and what the engine keeps with it. */
export interface OpenDocument {
	id: DocId;
	/** The tab's name: the file's name, or "Untitled-N". */
	name: string;
	doc: Document;
	history: History;
	view: View;
	/** The history state that matches the file on disk; the document is dirty anywhere else. */
	savedAt: number;
}

/** What {@link Documents} needs from the engine. */
export interface DocumentsHost {
	/** Post a message; `payload` travels with it and its buffer is transferred (thumbnails). */
	send(message: EngineToUi, payload?: Uint8Array): void;
	surfaces: SurfaceFactory;
	/** Decode an image file into a surface (the worker's `createImageBitmap`). */
	decode(file: Blob): Promise<Surface>;
	/** The viewport's size in device pixels, for a new document's view. */
	viewportSize(): { width: number; height: number };
	/** Something visible changed: redraw on the next frame. */
	redraw(): void;
}

/** What File ▸ New asks for (the New dialog's values). */
export interface NewDocumentArgs {
	name?: string;
	width: number;
	height: number;
	ppi?: number;
	/** Background Contents. */
	background?: "white" | "black" | "background" | "transparent";
}

/** Photoshop's largest document side (300 000 pixels); R-photo's canvas surfaces stop far lower. VERIFY: the browser's own canvas limit. */
const MAX_SIDE = 30000;

/** The open documents, the active one, and everything done to them. */
export class Documents {
	private readonly list: OpenDocument[] = [];
	private active: OpenDocument | null = null;
	private nextId = 1;
	private untitled = 0;
	/** Documents waiting to be closed after a "save changes?" answer (Close All). */
	private closing: DocId[] = [];
	private readonly host: DocumentsHost;

	/** The documents of an engine. */
	constructor(host: DocumentsHost) {
		this.host = host;
	}

	/** The document the viewport shows, or null. */
	get current(): OpenDocument | null {
		return this.active;
	}

	/** File ▸ New. `backgroundColor` is the tool bar's background colour. */
	create(args: NewDocumentArgs, backgroundColor: Rgba16): void {
		const width = Math.round(Number(args.width));
		const height = Math.round(Number(args.height));
		if (!(width >= 1 && height >= 1 && width <= MAX_SIDE && height <= MAX_SIDE)) {
			this.error(`Width and height must be between 1 and ${MAX_SIDE} pixels.`);
			return;
		}
		const ppi = Number(args.ppi) > 0 ? Number(args.ppi) : 72;
		const surface = this.host.surfaces.create(width, height, "rgba8");
		const contents = args.background ?? "white";
		const colors: Record<string, Rgba16 | null> = {
			white: [65535, 65535, 65535, 65535],
			black: [0, 0, 0, 65535],
			background: [backgroundColor[0], backgroundColor[1], backgroundColor[2], 65535],
			transparent: null,
		};
		const color = colors[contents] ?? null;
		if (color) {
			surface.draw({ op: "fill", color: [Math.round(color[0] / 257), Math.round(color[1] / 257), Math.round(color[2] / 257), 255] });
		}
		const doc = documentFromImage(surface, color === null, ppi);
		const first = doc.layers[0];
		if (color === null && first) {
			// Photoshop names the first layer of a transparent new document "Layer 1".
			first.name = "Layer 1";
		}
		const name = args.name?.trim() || `Untitled-${++this.untitled}`;
		this.add(name, doc, "New");
	}

	/** File ▸ Open, or files dropped on the window: one document per file. */
	async open(files: File[]): Promise<void> {
		for (const file of files) {
			if (!isOpenable(file.name, file.type)) {
				this.error(`Could not open “${file.name}”: R-photo opens PNG, JPEG, WebP, GIF and BMP files for now.`);
				continue;
			}
			this.host.send({ type: ENGINE.PROGRESS, label: `Opening ${file.name}`, fraction: 0 });
			try {
				const surface = await this.host.decode(file);
				const header = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
				const transparent = mayBeTransparent(file.name, file.type) && !isOpaque(surface);
				this.add(file.name, documentFromImage(surface, transparent, readResolution(header)), "Open");
			} catch (error) {
				console.error("r-photo: opening", file.name, error);
				this.error(`Could not open “${file.name}”: the file could not be read as an image.`);
			} finally {
				this.host.send({ type: ENGINE.PROGRESS_DONE });
			}
		}
	}

	/** A document tab was clicked. */
	activate(id: DocId): void {
		const found = this.list.find((d) => d.id === id);
		if (found && found !== this.active) {
			this.show(found);
		}
	}

	/** The View menu and the zoom field act on the active document's view; the caller redraws. */
	get view(): View | null {
		return this.active?.view ?? null;
	}

	/** A `command` message for document `id`. */
	command(id: DocId, raw: unknown): void {
		const open = this.list.find((d) => d.id === id);
		if (!open) {
			return;
		}
		const parsed = parseCommand(raw);
		if (typeof parsed === "string") {
			// An op the engine does not know yet toasts, as Fotox did; a
			// malformed one is an error.
			this.host.send(parsed.includes("not implemented yet") ? { type: ENGINE.TOAST, text: parsed } : { type: ENGINE.ERROR, text: parsed });
			return;
		}
		this.run(open, parsed);
	}

	/** Apply a command to a document and record it in the history. */
	run(open: OpenDocument, command: Command): void {
		const outcome = apply(open.doc, command, { surfaces: this.host.surfaces });
		if (!outcome.ok) {
			this.error(outcome.error);
			return;
		}
		if (outcome.effect.unchanged) {
			return;
		}
		open.history.record(open.doc, outcome.effect.label);
		this.changed(open, true);
	}

	/** Edit ▸ Undo, or a History panel click (one message per step). */
	undo(id: DocId): void {
		const open = this.list.find((d) => d.id === id);
		if (open?.history.undo(open.doc)) {
			this.changed(open, true);
		}
	}

	/** Edit ▸ Redo, or a History panel click. */
	redo(id: DocId): void {
		const open = this.list.find((d) => d.id === id);
		if (open?.history.redo(open.doc)) {
			this.changed(open, true);
		}
	}

	/** The active document's id, for menu actions that name none. */
	get activeId(): DocId | null {
		return this.active?.id ?? null;
	}

	/** A tab's ×, or File ▸ Close: asks "save changes?" when the document is dirty. */
	close(id: DocId): void {
		const open = this.list.find((d) => d.id === id);
		if (!open) {
			return;
		}
		if (isDirty(open)) {
			this.host.send({ type: ENGINE.CLOSE_DIRTY_DOCUMENT, doc: id, name: open.name });
			return;
		}
		this.remove(open);
		this.closeNext();
	}

	/** File ▸ Close All: one "save changes?" at a time; Cancel stops. */
	closeAll(): void {
		this.closing = this.list.map((d) => d.id);
		this.closeNext();
	}

	/** The answer to "save changes?". */
	answerClose(id: DocId, answer: "save" | "dont_save" | "cancel"): void {
		const open = this.list.find((d) => d.id === id);
		if (!open) {
			return;
		}
		switch (answer) {
			case "dont_save":
				this.remove(open);
				this.closeNext();
				return;
			case "save":
				// There is nothing to save to before the project file (W1-T07).
				this.closing = [];
				this.error("Saving arrives with the project file (W1-T07). Export the image, or close without saving.");
				return;
			case "cancel":
				this.closing = [];
				return;
		}
	}

	/** File ▸ Export As / Quick Export: encode the active document and hand it to the interface. */
	async export(format: ExportFormat, quality: number, request: number): Promise<void> {
		const open = this.active;
		if (!open) {
			this.error("There is no document to export.");
			return;
		}
		const settings = exportSettings(format, quality);
		this.host.send({ type: ENGINE.PROGRESS, label: "Exporting", fraction: 0 });
		try {
			const target = new ExportTarget(open.doc.width, open.doc.height, settings.matte);
			const view = new View(open.doc.width, open.doc.height, open.doc.width, open.doc.height);
			view.zoomAbout(1);
			composite(target, open.doc, view);
			const blob = await target.encode(settings.mime, settings.quality);
			this.host.send({ type: ENGINE.SAVE_FILE, request, name: exportName(open.name, settings), mime: settings.mime, blob });
		} catch (error) {
			console.error("r-photo: export", error);
			this.error("The export failed: the browser could not encode the image.");
		} finally {
			this.host.send({ type: ENGINE.PROGRESS_DONE });
		}
	}

	/** The Layers panel asked for thumbnails. */
	thumbnails(id: DocId, layers: number[], size: number): void {
		const open = this.list.find((d) => d.id === id);
		if (!open) {
			return;
		}
		for (const { layer } of layersTopDown(open.doc)) {
			if (!layers.includes(layer.id) || layer.kind !== "pixel") {
				continue;
			}
			const block = thumbnailOf(layer.pixels, layer.offset, open.doc.width, open.doc.height, Math.max(8, Math.min(256, size)));
			const payload = new Uint8Array(block.data.buffer, block.data.byteOffset, block.data.byteLength);
			this.host.send({ type: ENGINE.THUMBNAIL, doc: id, layer: layer.id, width: block.width, height: block.height }, payload);
		}
	}

	/** Tell the interface the view changed (after a zoom or pan of the active document). */
	sendView(): void {
		const open = this.active;
		if (open) {
			this.host.send({ type: ENGINE.VIEW, doc: open.id, zoom: open.view.zoom, center_x: open.view.centerX, center_y: open.view.centerY });
		}
	}

	/** The viewport changed size: every document's view follows. */
	resize(width: number, height: number): void {
		for (const open of this.list) {
			open.view.resize(width, height);
		}
		this.sendView();
	}

	/** Draw the active document (the viewport's frame). */
	draw(target: ViewportTarget): void {
		if (this.active) {
			composite(target, this.active.doc, this.active.view);
		} else {
			target.clear();
		}
	}

	private add(name: string, doc: Document, openLabel: string): void {
		const size = this.host.viewportSize();
		const open: OpenDocument = {
			id: this.nextId++,
			name,
			doc,
			history: new History(doc, openLabel),
			view: new View(doc.width, doc.height, size.width, size.height),
			savedAt: 0,
		};
		this.list.push(open);
		this.host.send({ type: ENGINE.DOCUMENT_OPENED, info: info(open) });
		this.show(open);
	}

	private show(open: OpenDocument): void {
		this.active = open;
		this.host.send({ type: ENGINE.ACTIVE_DOCUMENT, doc: open.id });
		this.sendLayers(open);
		this.sendHistory(open);
		this.sendView();
		this.host.redraw();
	}

	private remove(open: OpenDocument): void {
		const index = this.list.indexOf(open);
		if (index < 0) {
			return;
		}
		this.list.splice(index, 1);
		this.host.send({ type: ENGINE.DOCUMENT_CLOSED, doc: open.id });
		if (this.active === open) {
			// Photoshop shows the tab to the left, or the new first one.
			const next = this.list[Math.max(0, index - 1)] ?? null;
			if (next) {
				this.show(next);
			} else {
				this.active = null;
				this.host.send({ type: ENGINE.ACTIVE_DOCUMENT, doc: null });
				this.host.redraw();
			}
		}
	}

	private closeNext(): void {
		const id = this.closing.shift();
		if (id !== undefined) {
			this.close(id);
		}
	}

	private changed(open: OpenDocument, pixelsOrLayers: boolean): void {
		this.host.send({ type: ENGINE.DOCUMENT_CHANGED, info: info(open) });
		if (open === this.active) {
			this.sendLayers(open);
			this.sendHistory(open);
			if (pixelsOrLayers) {
				this.host.redraw();
			}
		}
	}

	private sendLayers(open: OpenDocument): void {
		this.host.send({ type: ENGINE.LAYERS, doc: open.id, layers: layersTopDown(open.doc).map(({ layer, depth }) => layerInfo(layer, depth, open.doc)) });
	}

	private sendHistory(open: OpenDocument): void {
		this.host.send({ type: ENGINE.HISTORY, doc: open.id, labels: open.history.labels, current: open.history.current });
	}

	private error(text: string): void {
		this.host.send({ type: ENGINE.ERROR, text });
	}
}

/**
 * Unsaved changes: the history is not at the state that was saved.
 * VERIFY: Photoshop keeps a document dirty after undoing back to its saved
 * state? Here it is clean again.
 */
function isDirty(open: OpenDocument): boolean {
	return open.history.current !== open.savedAt;
}

function info(open: OpenDocument): DocumentInfo {
	return {
		doc: open.id,
		name: open.name,
		width: open.doc.width,
		height: open.doc.height,
		ppi: open.doc.ppi,
		depth: "u8",
		dirty: isDirty(open),
		profile_name: open.doc.colorProfile,
	};
}

function layerInfo(layer: Layer, depth: number, doc: Document): LayerInfo {
	const locks = layer.locks;
	const background = layer.kind === "pixel" && layer.background;
	return {
		id: layer.id,
		name: layer.name,
		kind: layer.kind,
		depth,
		visible: layer.visible,
		opacity: layer.opacity,
		fill: layer.fill,
		blend: layer.blend,
		selected: layer.id === doc.activeLayer,
		clipped: layer.clipped,
		has_mask: layer.mask !== null,
		edit_mask: false,
		expanded: layer.kind === "group" ? !layer.collapsed : false,
		locked: background || locks.all || locks.pixels || locks.position || locks.transparency,
		locked_transparency: locks.transparency || locks.all,
		locked_pixels: locks.pixels || locks.all,
		locked_position: locks.position || locks.all,
		fill_color: layer.kind === "fill" ? layer.color : undefined,
	};
}
