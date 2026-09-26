import { canvasSurfaces } from "../core/raster/canvas-surface";
import type { Surface } from "../core/surface";
import { isExportFormat } from "../io/export";
import { Documents } from "./documents";
import type { NewDocumentArgs } from "./documents";
import { Navigation } from "./navigation";
import { ENGINE, UI, isUiLocalAction } from "./protocol";
import type { EngineFrame, EngineToUi, Rgba16, UiToEngine } from "./protocol";
import { Viewport } from "./viewport";
import type { FrameScheduler } from "./viewport";

/**
 * How the engine talks back: the worker entry passes `postMessage`, so the
 * engine itself never touches the worker's globals and can be driven headless
 * (W12).
 */
export type Post = (frame: EngineFrame, transfer?: Transferable[]) => void;

/** Decode an image file into a surface (the worker's `createImageBitmap` + a canvas surface). */
export type Decode = (file: Blob) => Promise<Surface>;

/**
 * The engine: owns the documents, applies commands, keeps the history, runs
 * the tools (`docs/ARCHITECTURE.md` §1). So far: it greets the interface
 * (W0-T03), draws the viewport and navigates it (W0-T04), opens, creates,
 * exports and closes documents (W0-T07), and says "not implemented yet" for
 * everything else that is not the interface's own business (Fotox's
 * behaviour; the "no dead menu items" rule comes in W1-T09).
 */
export class Engine {
	/** Pointer input over the viewport is the engine's (no popup, menu or dialog open). */
	directInput = true;
	/** The active tool's id (`tool:<id>` actions): `move`, `hand`, `zoom` … */
	tool = "move";
	/** The option bar that sent {@link toolOptions} (a tool's id, or `_transform`). */
	optionsBar = "";
	/** The option bar's values. */
	toolOptions: Record<string, unknown> = {};
	/** Foreground colour, straight RGBA 16-bit. */
	foreground: Rgba16 = [0, 0, 0, 65535];
	/** Background colour, straight RGBA 16-bit. */
	background: Rgba16 = [65535, 65535, 65535, 65535];

	private readonly post: Post;
	private readonly viewport: Viewport;
	private readonly navigation = new Navigation();
	private readonly documents: Documents;

	/** An engine that answers through `post`, draws on the frames `schedule` gives it, and decodes files with `decode`. */
	constructor(post: Post, schedule: FrameScheduler, decode: Decode) {
		this.post = post;
		this.viewport = new Viewport(schedule);
		this.documents = new Documents({
			send: (message, payload) => this.post(payload ? { message, payload } : { message }, payload ? [payload.buffer] : []),
			surfaces: canvasSurfaces,
			decode,
			viewportSize: () => ({ width: this.viewport.width, height: this.viewport.height }),
			redraw: () => this.viewport.requestDraw(),
		});
		this.viewport.onDraw = (target) => this.documents.draw(target);
	}

	/** Handle one message from the interface. Never throws: a failure becomes an `error` message. */
	handle(message: UiToEngine): void {
		try {
			this.dispatch(message);
		} catch (error) {
			// The interface must keep working whatever the engine does; the
			// details go to the worker's console.
			console.error("r-photo engine:", error);
			this.send({ type: ENGINE.ERROR, text: `The engine failed on "${message.type}".` });
		}
	}

	private dispatch(message: UiToEngine): void {
		switch (message.type) {
			case UI.HELLO:
				this.send({ type: ENGINE.TOAST, text: "Engine connected" });
				return;
			case UI.ACTION:
				this.action(message.id, message.args ?? {});
				return;
			case UI.DIRECT_INPUT:
				this.directInput = message.enabled;
				return;
			case UI.TOOL_OPTIONS:
				this.optionsBar = message.tool;
				this.toolOptions = message.options;
				return;
			case UI.SET_COLORS:
				this.foreground = message.fg;
				this.background = message.bg;
				return;
			case UI.KEY:
				// Only a tool with an operation in progress answers a key, and
				// there is none yet.
				return;
			case UI.VIEWPORT_CANVAS:
				this.viewport.attach(message.canvas, message.width, message.height, message.dpr, message.background);
				this.documents.resize(message.width, message.height);
				return;
			case UI.VIEWPORT_RESIZED:
				this.viewport.resize(message.width, message.height, message.dpr);
				this.documents.resize(message.width, message.height);
				return;
			case UI.POINTER: {
				const view = this.documents.view;
				if (!view || (!this.directInput && message.kind === "down")) {
					return;
				}
				this.viewChanged(this.navigation.pointer(view, this.tool, message));
				return;
			}
			case UI.WHEEL: {
				const view = this.documents.view;
				if (view && this.directInput) {
					this.viewChanged(this.navigation.wheel(view, message, this.viewport.dpr));
				}
				return;
			}
			case UI.SET_ZOOM:
				if (this.documents.activeId === message.doc) {
					this.viewChanged(this.documents.view?.zoomTo(message.zoom) ?? false);
				}
				return;
			case UI.COMMAND:
				this.documents.command(message.doc, message.command);
				return;
			case UI.UNDO:
				this.documents.undo(message.doc);
				return;
			case UI.REDO:
				this.documents.redo(message.doc);
				return;
			case UI.ACTIVATE_DOCUMENT:
				this.documents.activate(message.doc);
				return;
			case UI.CLOSE_DOCUMENT:
				this.documents.close(message.doc);
				return;
			case UI.CLOSE_DOCUMENT_ANSWER:
				this.documents.answerClose(message.doc, message.answer);
				return;
			case UI.OPEN_FILES:
				void this.documents.open(message.files);
				return;
			case UI.REQUEST_THUMBNAILS:
				this.documents.thumbnails(message.doc, message.layers, message.size);
				return;
			case UI.FILTER_PREVIEW:
			case UI.FILTER_PREVIEW_CANCEL:
			case UI.PROOF_SETUP:
				// Filters are W4; soft proofing is not in R-photo's cards.
				return;
		}
	}

	/**
	 * A menu item, shortcut or button. The view's actions are the engine's
	 * even though their prefixes are UI-local (`zoom:`, `tool:`): the prefix
	 * list only says which actions the engine must not toast about.
	 */
	private action(id: string, args: Record<string, unknown>): void {
		if (id.startsWith("tool:")) {
			// `tool:commit` / `tool:cancel` are a transform's ✓ and ✗, not tools.
			if (id !== "tool:commit" && id !== "tool:cancel") {
				this.tool = id.slice("tool:".length);
			}
			return;
		}
		const view = this.documents.view;
		const active = this.documents.activeId;
		switch (id) {
			case "zoom:in":
				this.viewChanged(view?.zoomIn() ?? false);
				return;
			case "zoom:out":
				this.viewChanged(view?.zoomOut() ?? false);
				return;
			case "zoom:fit":
				this.viewChanged(view?.fit() ?? false);
				return;
			case "zoom:fill":
				this.viewChanged(view?.fill() ?? false);
				return;
			case "zoom:100":
				this.viewChanged(view?.actual() ?? false);
				return;
			case "zoom:print":
				this.viewChanged(view?.printSize(this.documents.current?.doc.ppi ?? 72) ?? false);
				return;
			case "doc:new":
				this.documents.create(args as unknown as NewDocumentArgs, this.background);
				return;
			case "export:as": {
				const format = args["format"];
				if (!isExportFormat(format)) {
					this.send({ type: ENGINE.ERROR, text: "R-photo exports PNG, JPEG and WebP for now." });
					return;
				}
				void this.documents.export(format, Number(args["quality"] ?? 90), Number(args["request"] ?? 0));
				return;
			}
			case "export:png":
			case "export:jpg":
			case "export:webp":
				// The interface asks for the file first, then sends `export:as`.
				return;
			case "tab:close":
				if (active !== null) {
					this.documents.close(active);
				}
				return;
			case "tab:close-all":
				this.documents.closeAll();
				return;
			case "hist:undo":
				if (active !== null) {
					this.documents.undo(active);
				}
				return;
			case "hist:redo":
				if (active !== null) {
					this.documents.redo(active);
				}
				return;
		}
		if (isUiLocalAction(id)) {
			return;
		}
		this.notImplemented(id);
	}

	/** After a view change: redraw, and tell the interface (rulers, zoom field, tab label). */
	private viewChanged(changed: boolean): void {
		if (!changed) {
			return;
		}
		this.viewport.requestDraw();
		this.documents.sendView();
	}

	private notImplemented(what: string): void {
		this.send({ type: ENGINE.TOAST, text: `${what}: not implemented yet` });
	}

	private send(message: EngineToUi, transfer?: Transferable[]): void {
		this.post({ message }, transfer);
	}
}
