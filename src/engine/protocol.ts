/**
 * The messages between the interface (main thread) and the engine (worker).
 *
 * Fotox's protocol (`fotox/docs/PROTOCOL.md`, `ui/js/native/protocol.js`),
 * now typed and the one source of the names: `ui/js/native/protocol.js`
 * re-exports `UI` and `ENGINE` from here, so the interface and the engine
 * cannot drift apart.
 *
 * Fotox's document was not at hand when this file was written (W0-T03); the
 * fields are those the interface reads and writes (`ui/js/native/*.js`,
 * `ui/js/canvas.js`, `ui/js/main.js`). Where a field's meaning is inferred
 * rather than read, its comment says `VERIFY`.
 *
 * Transport: `postMessage` between the main thread and a module worker. A
 * message is a plain object with a `type` field; Fotox's binary frames are
 * gone (they were CEF's), and a message that carries pixels (`thumbnail`)
 * travels as an {@link EngineFrame} whose `payload` buffer is transferred.
 */

/** UI → engine message type names (Fotox's `UiToEngine`). */
export const UI = Object.freeze({
	HELLO: "hello",
	DIRECT_INPUT: "direct_input",
	VIEWPORT_BOUNDS: "viewport_bounds",
	ACTION: "action",
	COMMAND: "command",
	UNDO: "undo",
	REDO: "redo",
	ACTIVATE_DOCUMENT: "activate_document",
	CLOSE_DOCUMENT: "close_document",
	CLOSE_DOCUMENT_ANSWER: "close_document_answer",
	FILTER_PREVIEW: "filter_preview",
	FILTER_PREVIEW_CANCEL: "filter_preview_cancel",
	PROOF_SETUP: "proof_setup",
	SET_ZOOM: "set_zoom",
	REQUEST_THUMBNAILS: "request_thumbnails",
	TOOL_OPTIONS: "tool_options",
	SET_COLORS: "set_colors",
	KEY: "key",
} as const);

/** Engine → UI message type names (Fotox's `EngineToUi`). */
export const ENGINE = Object.freeze({
	DOCUMENT_OPENED: "document_opened",
	DOCUMENT_CHANGED: "document_changed",
	CLOSE_DIRTY_DOCUMENT: "close_dirty_document",
	CMYK_PROFILES: "cmyk_profiles",
	PROOF_STATE: "proof_state",
	TOOL_INFO: "tool_info",
	TRANSFORM_BOX: "transform_box",
	DOCUMENT_CLOSED: "document_closed",
	ACTIVE_DOCUMENT: "active_document",
	LAYERS: "layers",
	HISTORY: "history",
	VIEW: "view",
	STATUS: "status",
	PROGRESS: "progress",
	PROGRESS_DONE: "progress_done",
	TOAST: "toast",
	ERROR: "error",
	COLOR_PICKED: "color_picked",
	THUMBNAIL: "thumbnail",
} as const);

/**
 * Action id prefixes the interface handles by itself (panels, tools, view
 * flags, screen modes, dialogs, zoom, workspaces, paragraph styles, debug).
 * The engine stays quiet about them instead of toasting "not implemented" on
 * every panel click. Fotox's `fx_protocol::UI_LOCAL_ACTION_PREFIXES`; the mock
 * engine reads the same list.
 */
export const UI_LOCAL_ACTION_PREFIXES: readonly string[] = Object.freeze([
	"panel:",
	"panels:",
	"tool:",
	"toggle:",
	"screen:",
	"dlg:",
	"zoom:",
	"ws:",
	"par:",
	"debug:",
]);

/** True when the interface handles action `id` by itself. */
export function isUiLocalAction(id: string): boolean {
	return UI_LOCAL_ACTION_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** A document's id, chosen by the engine and never reused in a session. */
export type DocId = number;

/** A layer's id, unique within its document. */
export type LayerId = number;

/** A colour as the protocol carries it: straight RGBA, 16 bits a channel (0‥65535). */
export type Rgba16 = [number, number, number, number];

/* ------------------------------------------------------------ UI → engine */

/** The first message: the interface is up and listening. */
export interface HelloMessage {
	type: typeof UI.HELLO;
	ui_version: string;
}

/** Whether pointer input over the viewport is the engine's (no popup, menu or dialog open). */
export interface DirectInputMessage {
	type: typeof UI.DIRECT_INPUT;
	enabled: boolean;
}

/** Where the viewport is, in physical window pixels. CEF's; the worker ignores it (W0-T04 has `viewport_resized`). */
export interface ViewportBoundsMessage {
	type: typeof UI.VIEWPORT_BOUNDS;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * A menu item, shortcut or button. Every action is sent; the engine ignores
 * the UI-local ones ({@link isUiLocalAction}). `args` carries a dialog's
 * values for the actions that have one (`edit:fill`, `export:as` …).
 */
export interface ActionMessage {
	type: typeof UI.ACTION;
	id: string;
	args?: Record<string, unknown>;
}

/**
 * A document command (`docs/ARCHITECTURE.md` §4): `command.op` names it, the
 * other fields are its parameters. Typed by the core (W0-T05); here it is
 * the wire form.
 */
export interface CommandMessage {
	type: typeof UI.COMMAND;
	doc: DocId;
	command: { op: string } & Record<string, unknown>;
}

/** One step back in the document's history. */
export interface UndoMessage {
	type: typeof UI.UNDO;
	doc: DocId;
}

/** One step forward in the document's history. */
export interface RedoMessage {
	type: typeof UI.REDO;
	doc: DocId;
}

/** A document tab was clicked. */
export interface ActivateDocumentMessage {
	type: typeof UI.ACTIVATE_DOCUMENT;
	doc: DocId;
}

/** A document tab's close button. The engine may answer `close_dirty_document`. */
export interface CloseDocumentMessage {
	type: typeof UI.CLOSE_DOCUMENT;
	doc: DocId;
}

/** The answer to `close_dirty_document`. */
export interface CloseDocumentAnswerMessage {
	type: typeof UI.CLOSE_DOCUMENT_ANSWER;
	doc: DocId;
	answer: "save" | "dont_save" | "cancel";
}

/** A filter dialog's live preview (W4). `filter` is the filter's id and parameters. */
export interface FilterPreviewMessage {
	type: typeof UI.FILTER_PREVIEW;
	doc: DocId;
	layer: LayerId;
	filter: Record<string, unknown>;
}

/** The filter dialog closed, or its Preview box was unticked. */
export interface FilterPreviewCancelMessage {
	type: typeof UI.FILTER_PREVIEW_CANCEL;
	doc: DocId;
}

/** View ▸ Proof Setup (Fotox's soft proofing; not planned in R-photo's cards yet). */
export interface ProofSetupMessage {
	type: typeof UI.PROOF_SETUP;
	doc: DocId;
	path: string;
	intent: string;
	bpc: boolean;
	simulate_paper: boolean;
}

/** An explicit zoom from the zoom field: `zoom` is a factor (1 = 100 %). */
export interface SetZoomMessage {
	type: typeof UI.SET_ZOOM;
	doc: DocId;
	zoom: number;
}

/** The Layers panel wants thumbnails of these layers, `size` pixels on their long side. */
export interface RequestThumbnailsMessage {
	type: typeof UI.REQUEST_THUMBNAILS;
	doc: DocId;
	layers: LayerId[];
	size: number;
}

/** The option bar's values for `tool`, sent on every change. */
export interface ToolOptionsMessage {
	type: typeof UI.TOOL_OPTIONS;
	tool: string;
	options: Record<string, unknown>;
}

/** The foreground and background colours. */
export interface SetColorsMessage {
	type: typeof UI.SET_COLORS;
	fg: Rgba16;
	bg: Rgba16;
}

/**
 * A key the shortcut map did not consume, for the tool in progress (Escape
 * cancels a lasso, Enter closes a polygon). `key` is `KeyboardEvent.key`,
 * with `Shift+` in front of the arrows when Shift is down.
 */
export interface KeyMessage {
	type: typeof UI.KEY;
	key: string;
}

/** Everything the interface sends the engine. */
export type UiToEngine =
	| HelloMessage
	| DirectInputMessage
	| ViewportBoundsMessage
	| ActionMessage
	| CommandMessage
	| UndoMessage
	| RedoMessage
	| ActivateDocumentMessage
	| CloseDocumentMessage
	| CloseDocumentAnswerMessage
	| FilterPreviewMessage
	| FilterPreviewCancelMessage
	| ProofSetupMessage
	| SetZoomMessage
	| RequestThumbnailsMessage
	| ToolOptionsMessage
	| SetColorsMessage
	| KeyMessage;

/* ------------------------------------------------------------ engine → UI */

/**
 * What the interface knows about a document: the tab label and tooltip, the
 * status bar's size, Image Size's starting values.
 */
export interface DocumentInfo {
	doc: DocId;
	name: string;
	width: number;
	height: number;
	/** Pixels per inch. */
	ppi: number;
	/** `"u8"` or `"u16"` (the tab shows RGB/8 or RGB/16). */
	depth: "u8" | "u16";
	/** Unsaved changes: the tab shows a `*`. */
	dirty: boolean;
	/** The colour profile's name, for the tab's tooltip. */
	profile_name: string;
}

/** A document was opened or created; a tab appears. */
export interface DocumentOpenedMessage {
	type: typeof ENGINE.DOCUMENT_OPENED;
	info: DocumentInfo;
}

/** A document's name, size, depth or dirty flag changed. */
export interface DocumentChangedMessage {
	type: typeof ENGINE.DOCUMENT_CHANGED;
	info: DocumentInfo;
}

/** A dirty document is being closed: the interface asks "save changes?". */
export interface CloseDirtyDocumentMessage {
	type: typeof ENGINE.CLOSE_DIRTY_DOCUMENT;
	doc: DocId;
	name: string;
}

/** The CMYK profiles found (Fotox's soft proofing). */
export interface CmykProfilesMessage {
	type: typeof ENGINE.CMYK_PROFILES;
	profiles: { name: string; path: string }[];
}

/** Proof Colors / Gamut Warning state (Fotox's soft proofing). */
export interface ProofStateMessage {
	type: typeof ENGINE.PROOF_STATE;
	proof_colors: boolean;
	gamut_warning: boolean;
	profile?: string;
}

/** A tool's status line (a marquee's size while dragging). */
export interface ToolInfoMessage {
	type: typeof ENGINE.TOOL_INFO;
	text: string;
}

/** A Free Transform box went up or down: the option bar swaps. */
export interface TransformBoxMessage {
	type: typeof ENGINE.TRANSFORM_BOX;
	up: boolean;
}

/** A document is gone; its tab goes. */
export interface DocumentClosedMessage {
	type: typeof ENGINE.DOCUMENT_CLOSED;
	doc: DocId;
}

/** The active document, or `null` when none is open. */
export interface ActiveDocumentMessage {
	type: typeof ENGINE.ACTIVE_DOCUMENT;
	doc: DocId | null;
}

/**
 * One row of the Layers panel. The list is flat, top → bottom; the tree is
 * given by `depth`. Typed as far as W0 needs; W1 completes it.
 */
export interface LayerInfo {
	id: LayerId;
	name: string;
	kind: "pixel" | "group" | "fill" | "adjustment" | "shape" | "text" | "smart";
	/** Nesting depth: 0 at the top level. */
	depth: number;
	visible: boolean;
	/** 0‥1. */
	opacity: number;
	blend: string;
	selected: boolean;
	clipped: boolean;
	has_mask: boolean;
	/** Painting edits the mask, not the pixels. */
	edit_mask: boolean;
	/** Groups: open in the panel. */
	expanded: boolean;
	/** Any lock is on: the row shows a padlock. */
	locked: boolean;
	/** Lock transparent pixels. */
	locked_transparency: boolean;
	/** Lock image pixels. */
	locked_pixels: boolean;
	/** Lock position. */
	locked_position: boolean;
	/** Fill layers: the colour. */
	fill_color?: Rgba16;
	/** Adjustment layers: the settings (W4). */
	adjustment?: { kind: string } & Record<string, unknown>;
}

/** The active document's layers changed. */
export interface LayersMessage {
	type: typeof ENGINE.LAYERS;
	doc: DocId;
	layers: LayerInfo[];
}

/**
 * The History panel: `labels` are the states after "Open", oldest first;
 * `current` is the index of the state shown (0 = Open), and the states after
 * it are the undone ones (grey).
 */
export interface HistoryMessage {
	type: typeof ENGINE.HISTORY;
	doc: DocId;
	labels: string[];
	current: number;
}

/**
 * The view of the active document, so the rulers, the zoom field and the tab
 * label follow. `zoom` is **device** pixels per document pixel; `center_x`,
 * `center_y` are the document point at the centre of the viewport (the
 * rulers' mapping in `ui/js/canvas.js`).
 */
export interface ViewMessage {
	type: typeof ENGINE.VIEW;
	doc: DocId;
	zoom: number;
	center_x: number;
	center_y: number;
}

/** Frame and memory statistics (the status bar's RAM field, the Ctrl+Alt+F overlay). */
export interface StatusMessage {
	type: typeof ENGINE.STATUS;
	memory: { hot_bytes: number; warm_bytes: number; scratch_bytes: number; gpu_bytes: number };
	fps: number;
	frame_ms_p50: number;
	frame_ms_p99: number;
	uploads: number;
	pending_loads: number;
	input_latency_ms_p50?: number;
	input_latency_ms_p99?: number;
}

/** A long job's progress, in the status bar. `fraction` is 0‥1. */
export interface ProgressMessage {
	type: typeof ENGINE.PROGRESS;
	label: string;
	fraction: number;
}

/** The long job is over. */
export interface ProgressDoneMessage {
	type: typeof ENGINE.PROGRESS_DONE;
}

/** A short notice. */
export interface ToastMessage {
	type: typeof ENGINE.TOAST;
	text: string;
}

/** Something failed; one sentence the interface can show as it is. */
export interface ErrorMessage {
	type: typeof ENGINE.ERROR;
	text: string;
}

/** The Eyedropper picked a colour for the foreground or the background. */
export interface ColorPickedMessage {
	type: typeof ENGINE.COLOR_PICKED;
	rgba: Rgba16;
	target: "fg" | "bg";
}

/**
 * A layer thumbnail. The pixels travel as the frame's `payload`: straight
 * RGBA, 8 bits a channel, `width × height × 4` bytes.
 */
export interface ThumbnailMessage {
	type: typeof ENGINE.THUMBNAIL;
	doc: DocId;
	layer: LayerId;
	width: number;
	height: number;
}

/** Everything the engine sends the interface. */
export type EngineToUi =
	| DocumentOpenedMessage
	| DocumentChangedMessage
	| CloseDirtyDocumentMessage
	| CmykProfilesMessage
	| ProofStateMessage
	| ToolInfoMessage
	| TransformBoxMessage
	| DocumentClosedMessage
	| ActiveDocumentMessage
	| LayersMessage
	| HistoryMessage
	| ViewMessage
	| StatusMessage
	| ProgressMessage
	| ProgressDoneMessage
	| ToastMessage
	| ErrorMessage
	| ColorPickedMessage
	| ThumbnailMessage;

/**
 * What the worker posts: a message, and for the messages that carry pixels
 * the bytes, whose buffer is transferred rather than copied.
 */
export interface EngineFrame {
	message: EngineToUi;
	payload?: Uint8Array;
}
