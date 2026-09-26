import { ENGINE, UI, isUiLocalAction } from "./protocol";
import type { EngineFrame, EngineToUi, Rgba16, UiToEngine } from "./protocol";

/**
 * How the engine talks back: the worker entry passes `postMessage`, so the
 * engine itself never touches the worker's globals and can be driven headless
 * (W12).
 */
export type Post = (frame: EngineFrame, transfer?: Transferable[]) => void;

/**
 * The engine: owns the documents, applies commands, keeps the history, runs
 * the tools (`docs/ARCHITECTURE.md` §1). W0-T03 is the empty shell: it greets
 * the interface, keeps the state the interface sends it, and says "not
 * implemented yet" for everything that is not the interface's own business
 * (Fotox's behaviour; the "no dead menu items" rule comes in W1-T09).
 */
export class Engine {
	/** Pointer input over the viewport is the engine's (no popup, menu or dialog open). */
	directInput = true;
	/** The active tool and its option bar values. */
	tool = "";
	/** The option bar's values for {@link tool}. */
	toolOptions: Record<string, unknown> = {};
	/** Foreground colour, straight RGBA 16-bit. */
	foreground: Rgba16 = [0, 0, 0, 65535];
	/** Background colour, straight RGBA 16-bit. */
	background: Rgba16 = [65535, 65535, 65535, 65535];

	private readonly post: Post;

	/** An engine that answers through `post`. */
	constructor(post: Post) {
		this.post = post;
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
				if (isUiLocalAction(message.id)) {
					return;
				}
				this.notImplemented(message.id);
				return;
			case UI.DIRECT_INPUT:
				this.directInput = message.enabled;
				return;
			case UI.TOOL_OPTIONS:
				this.tool = message.tool;
				this.toolOptions = message.options;
				return;
			case UI.SET_COLORS:
				this.foreground = message.fg;
				this.background = message.bg;
				return;
			case UI.VIEWPORT_BOUNDS:
				// CEF's: where to draw natively under the page. The worker draws
				// into the viewport's own canvas instead (W0-T04).
				return;
			case UI.KEY:
				// Only a tool with an operation in progress answers a key, and
				// there is none yet.
				return;
			case UI.COMMAND:
				this.notImplemented(message.command.op);
				return;
			case UI.UNDO:
			case UI.REDO:
			case UI.ACTIVATE_DOCUMENT:
			case UI.CLOSE_DOCUMENT:
			case UI.CLOSE_DOCUMENT_ANSWER:
			case UI.FILTER_PREVIEW:
			case UI.FILTER_PREVIEW_CANCEL:
			case UI.PROOF_SETUP:
			case UI.SET_ZOOM:
			case UI.REQUEST_THUMBNAILS:
				// These name a document, and there are no documents yet: nothing
				// the interface could have sent them about exists.
				return;
		}
	}

	private notImplemented(what: string): void {
		this.send({ type: ENGINE.TOAST, text: `${what}: not implemented yet` });
	}

	private send(message: EngineToUi): void {
		this.post({ message });
	}
}
