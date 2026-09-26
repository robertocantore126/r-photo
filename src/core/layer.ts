import type { Surface } from "./surface";

/**
 * The layer model (`docs/ARCHITECTURE.md` §4): Fotox's, which is Photoshop's
 * (`fotox/crates/fx-core/src/layer.rs`), in TypeScript. Only `pixel` layers
 * work in W0; the other kinds are typed so the model does not change shape
 * when W1, W4, W5 and W8 give them a meaning.
 *
 * The factory's shape (`create` with every default spelled out, and a
 * counter for ids) follows BitMappery's `layer-factory.ts` (MIT, Igor Zinken);
 * the fields are Fotox's.
 */

/** A layer's id, unique within its document and never reused there. */
export type LayerId = number;

/**
 * Photoshop's 27 blend modes, plus Pass Through for groups. The ids are
 * Fotox's (and the Layers panel's): `snake_case` of Photoshop's names.
 */
export const BLEND_MODES = Object.freeze([
	"pass_through",
	"normal", "dissolve",
	"darken", "multiply", "color_burn", "linear_burn", "darker_color",
	"lighten", "screen", "color_dodge", "linear_dodge", "lighter_color",
	"overlay", "soft_light", "hard_light", "vivid_light", "linear_light", "pin_light", "hard_mix",
	"difference", "exclusion", "subtract", "divide",
	"hue", "saturation", "color", "luminosity",
] as const);

/** One of {@link BLEND_MODES}. */
export type BlendMode = (typeof BLEND_MODES)[number];

/** True when `value` names a blend mode. */
export function isBlendMode(value: unknown): value is BlendMode {
	return typeof value === "string" && (BLEND_MODES as readonly string[]).includes(value);
}

/** Photoshop's four locks (Layers panel: transparency, pixels, position, all). Enforced from W1-T01. */
export interface Locks {
	transparency: boolean;
	pixels: boolean;
	position: boolean;
	/** Lock All: everything above and the layer's properties. */
	all: boolean;
}

/** A layer mask: gray coverage (white shows, black hides). Used from W1-T05. */
export interface Mask {
	surface: Surface;
	enabled: boolean;
	/** Linked: the mask moves with the layer. */
	linked: boolean;
	/** Where the mask's top-left corner is in the document. */
	offset: { x: number; y: number };
}

/** What every layer kind has. */
interface LayerBase {
	id: LayerId;
	name: string;
	visible: boolean;
	/** 0‥1: the whole layer, effects included. */
	opacity: number;
	/** 0‥1: the layer's content only (W8's effects are not affected). */
	fill: number;
	blend: BlendMode;
	/** Clipped to the layer below (a clipping mask). */
	clipped: boolean;
	locks: Locks;
	mask: Mask | null;
	/** Where the layer's top-left corner is in the document (pixel layers can be larger or smaller than the canvas). */
	offset: { x: number; y: number };
}

/** A layer of pixels. */
export interface PixelLayer extends LayerBase {
	kind: "pixel";
	pixels: Surface;
	/**
	 * Photoshop's Background layer: the bottom layer of a document opened
	 * from a flat file, opaque and immovable. Its rules arrive with the
	 * commands that need them (W1).
	 */
	background: boolean;
}

/** A layer group. */
export interface GroupLayer extends LayerBase {
	kind: "group";
	/** Bottom → top, like the document's list. */
	children: Layer[];
	/** Closed in the Layers panel. */
	collapsed: boolean;
}

/** A solid colour fill layer (W1-T08). */
export interface FillLayer extends LayerBase {
	kind: "fill";
	/** Straight RGBA, 16 bits a channel. */
	color: [number, number, number, number];
}

/** An adjustment layer (typed in W1, rendered in W4). */
export interface AdjustmentLayer extends LayerBase {
	kind: "adjustment";
	adjustment: { kind: string } & Record<string, unknown>;
}

/** Shape (W5), type (W5) and smart object (W8) layers: typed now, their data defined by those cards. */
export interface LaterLayer extends LayerBase {
	kind: "shape" | "text" | "smart";
	data: unknown;
}

/** Any layer. */
export type Layer = PixelLayer | GroupLayer | FillLayer | AdjustmentLayer | LaterLayer;

/** The defaults Photoshop gives a new layer, apart from its id, name and content. */
function base(id: LayerId, name: string): LayerBase {
	return {
		id,
		name,
		visible: true,
		opacity: 1,
		fill: 1,
		blend: "normal",
		clipped: false,
		locks: { transparency: false, pixels: false, position: false, all: false },
		mask: null,
		offset: { x: 0, y: 0 },
	};
}

/** A new pixel layer holding `pixels`. */
export function createPixelLayer(id: LayerId, name: string, pixels: Surface, background = false): PixelLayer {
	return { ...base(id, name), kind: "pixel", pixels, background };
}

/**
 * A copy of a layer for the history: the same properties, and a
 * copy-on-write snapshot of every surface, so the copy is cheap and later
 * edits of the live layer do not reach it.
 */
export function snapshotLayer(layer: Layer): Layer {
	const mask = layer.mask ? { ...layer.mask, offset: { ...layer.mask.offset }, surface: layer.mask.surface.snapshot() } : null;
	const common = { locks: { ...layer.locks }, offset: { ...layer.offset }, mask };
	switch (layer.kind) {
		case "pixel":
			return { ...layer, ...common, pixels: layer.pixels.snapshot() };
		case "group":
			return { ...layer, ...common, children: layer.children.map(snapshotLayer) };
		case "fill":
			return { ...layer, ...common, color: [...layer.color] };
		case "adjustment":
			return { ...layer, ...common, adjustment: structuredClone(layer.adjustment) };
		case "shape":
		case "text":
		case "smart":
			return { ...layer, ...common };
	}
}
