import { Navigation } from "./navigation";
import { ENGINE, UI, isUiLocalAction } from "./protocol";
import type { DocId, EngineFrame, EngineToUi, Rgba16, UiToEngine } from "./protocol";
import { canvasSurfaces } from "../core/raster/canvas-surface";
import { composite } from "./compositor";
import { buildTestDocument } from "./test-pattern";
import { View } from "./view";
import { Viewport } from "./viewport";
import type { FrameScheduler, ViewportTarget } from "./viewport";

/**
 * How the engine talks back: the worker entry passes `postMessage`, so the
 * engine itself never touches the worker's globals and can be driven headless
 * (W12).
 */
export type Post = (frame: EngineFrame, transfer?: Transferable[]) => void;

/**
 * What is shown in the viewport. W0-T04 has only the temporary test pattern
 * (`debug:test-pattern`); W0-T07 replaces it with the open documents.
 */
interface Shown {
	doc: DocId;
	view: View;
	draw(target: ViewportTarget, view: View): void;
}

/**
 * The engine: owns the documents, applies commands, keeps the history, runs
 * the tools (`docs/ARCHITECTURE.md` §1). So far: it greets the interface
 * (W0-T03), draws the viewport and navigates it (W0-T04), keeps the state the
 * interface sends it, and says "not implemented yet" for everything else that
 * is not the interface's own business (Fotox's behaviour; the "no dead menu
 * items" rule comes in W1-T09).
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
	private shown: Shown | null = null;

	/** An engine that answers through `post` and draws on the frames `schedule` gives it. */
	constructor(post: Post, schedule: FrameScheduler) {
		this.post = post;
		this.viewport = new Viewport(schedule);
		this.viewport.onDraw = (target) => {
			if (this.shown) {
				this.shown.draw(target, this.shown.view);
			} else {
				target.clear();
			}
		};
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
				this.action(message.id);
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
			case UI.COMMAND:
				this.notImplemented(message.command.op);
				return;
			case UI.VIEWPORT_CANVAS:
				this.viewport.attach(message.canvas, message.width, message.height, message.dpr, message.background);
				this.viewChanged(this.shown?.view.resize(message.width, message.height) ?? false);
				return;
			case UI.VIEWPORT_RESIZED:
				this.viewport.resize(message.width, message.height, message.dpr);
				this.viewChanged(this.shown?.view.resize(message.width, message.height) ?? false);
				return;
			case UI.POINTER:
				if (!this.shown || (!this.directInput && message.kind === "down")) {
					return;
				}
				this.viewChanged(this.navigation.pointer(this.shown.view, this.tool, message));
				return;
			case UI.WHEEL:
				if (this.shown && this.directInput) {
					this.viewChanged(this.navigation.wheel(this.shown.view, message, this.viewport.dpr));
				}
				return;
			case UI.SET_ZOOM:
				if (this.shown && this.shown.doc === message.doc) {
					this.viewChanged(this.shown.view.zoomTo(message.zoom));
				}
				return;
			case UI.UNDO:
			case UI.REDO:
			case UI.ACTIVATE_DOCUMENT:
			case UI.CLOSE_DOCUMENT:
			case UI.CLOSE_DOCUMENT_ANSWER:
			case UI.FILTER_PREVIEW:
			case UI.FILTER_PREVIEW_CANCEL:
			case UI.PROOF_SETUP:
			case UI.REQUEST_THUMBNAILS:
				// These name a document, and there are no documents yet: nothing
				// the interface could have sent them about exists.
				return;
		}
	}

	/**
	 * A menu item, shortcut or button. The view's actions are the engine's
	 * even though their prefixes are UI-local (`zoom:`, `tool:`): the prefix
	 * list only says which actions the engine must not toast about.
	 */
	private action(id: string): void {
		if (id.startsWith("tool:")) {
			// `tool:commit` / `tool:cancel` are a transform's ✓ and ✗, not tools.
			if (id !== "tool:commit" && id !== "tool:cancel") {
				this.tool = id.slice("tool:".length);
			}
			return;
		}
		if (id === "debug:test-pattern") {
			this.showTestPattern();
			return;
		}
		const view = this.shown?.view;
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
				// VERIFY: the document's resolution arrives with documents (W0-T07); 72 ppi until then.
				this.viewChanged(view?.printSize(72) ?? false);
				return;
		}
		if (isUiLocalAction(id)) {
			return;
		}
		this.notImplemented(id);
	}

	/** Show the temporary 4000 × 3000 test document (W0-T04 / T06, until W0-T07 opens real documents). */
	private showTestPattern(): void {
		const doc = buildTestDocument(canvasSurfaces);
		this.shown = {
			doc: 0,
			view: new View(doc.width, doc.height, this.viewport.width, this.viewport.height),
			draw: (target, view) => composite(target, doc, view),
		};
		this.viewChanged(true);
	}

	/** After a view change: redraw, and tell the interface (rulers, zoom field, tab label). */
	private viewChanged(changed: boolean): void {
		if (!changed || !this.shown) {
			return;
		}
		this.viewport.requestDraw();
		const { view, doc } = this.shown;
		this.send({ type: ENGINE.VIEW, doc, zoom: view.zoom, center_x: view.centerX, center_y: view.centerY });
	}

	private notImplemented(what: string): void {
		this.send({ type: ENGINE.TOAST, text: `${what}: not implemented yet` });
	}

	private send(message: EngineToUi): void {
		this.post({ message });
	}
}
