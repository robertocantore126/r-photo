import { findLayer, countLayers } from "./document";
import type { Document } from "./document";
import { createPixelLayer } from "./layer";
import type { Layer, LayerId } from "./layer";
import { boundsOf, intersect, isEmpty, isWholeRect } from "./surface";
import type { Rect, Rgba8, SurfaceFactory } from "./surface";

/**
 * Commands (ROADMAP §3 rule 2, Fotox's D-010): every change to a document is
 * one of these — plain, serialisable data, validated before anything changes,
 * applied by {@link apply}, and undoable through the history's snapshots.
 * The names are Fotox's `fx_core::Command` names where one exists, so the
 * protocol's `command` message carries them unchanged.
 *
 * W0 has four; W1-T01 brings the rest of the layer commands.
 */

/** A layer named in a command. An object, as Fotox's protocol has it, so it can later also name a layer by index or name. */
export interface LayerRef {
	id: LayerId;
}

/** A colour in a command: straight RGBA, 16 bits a channel, as the protocol carries colours. */
export type Rgba16 = [number, number, number, number];

/** Layer ▸ New ▸ Layer: an empty pixel layer, above the active one, which it becomes. */
export interface AddLayerCommand {
	op: "add_layer";
	/** Photoshop's default is "Layer N", the next free number. */
	name?: string;
}

/** Layer ▸ Delete ▸ Layer. */
export interface DeleteLayerCommand {
	op: "delete_layer";
	layer: LayerRef;
}

/** The properties W0's `set_layer_props` can change (W1-T01 adds the rest). */
export interface LayerProps {
	visible?: boolean;
	/** 0‥1. */
	opacity?: number;
	name?: string;
}

/** Change a layer's properties (the eye, the opacity field, a rename). */
export interface SetLayerPropsCommand {
	op: "set_layer_props";
	layer: LayerRef;
	props: LayerProps;
}

/**
 * Edit ▸ Fill with a colour, Normal, 100 %, over `rect` (the whole layer when
 * absent; the selection from W2).
 */
export interface FillLayerCommand {
	op: "fill_layer";
	layer: LayerRef;
	color: Rgba16;
	rect?: Rect;
}

/** Every command W0 knows. */
export type Command = AddLayerCommand | DeleteLayerCommand | SetLayerPropsCommand | FillLayerCommand;

/** The names of the commands, for the engine to tell a command it knows from one it does not. */
export const COMMAND_OPS: readonly Command["op"][] = Object.freeze(["add_layer", "delete_layer", "set_layer_props", "fill_layer"]);

/** True when `op` is a command W0 knows. */
export function isCommandOp(op: string): op is Command["op"] {
	return (COMMAND_OPS as readonly string[]).includes(op);
}

/**
 * Check that `value` (a command as it arrived, from the protocol or a
 * script) has the shape of a {@link Command}: the op is known and the fields
 * {@link validate} relies on are there. Returns the command, or why not.
 */
export function parseCommand(value: unknown): Command | string {
	if (typeof value !== "object" || value === null || typeof (value as { op?: unknown }).op !== "string") {
		return "That is not a command.";
	}
	const command = value as { op: string; layer?: unknown; props?: unknown };
	if (!isCommandOp(command.op)) {
		return `${command.op}: not implemented yet`;
	}
	const hasLayer = typeof command.layer === "object" && command.layer !== null && Number.isInteger((command.layer as { id?: unknown }).id);
	switch (command.op) {
		case "add_layer":
			return value as AddLayerCommand;
		case "delete_layer":
		case "fill_layer":
			return hasLayer ? (value as Command) : "The command names no layer.";
		case "set_layer_props":
			if (!hasLayer) {
				return "The command names no layer.";
			}
			return typeof command.props === "object" && command.props !== null ? (value as SetLayerPropsCommand) : "The command changes nothing.";
	}
}

/**
 * What applying a command did, so the engine redraws and reports only what
 * it has to.
 */
export interface Effect {
	/** Photoshop's History panel label. */
	label: string;
	/** The pixel regions that changed, per layer (document pixels). */
	pixelsChanged: { layer: LayerId; rect: Rect }[];
	/** A layer's properties changed (the Layers panel's rows). */
	propsChanged: boolean;
	/** Layers were added, removed or moved. */
	structureChanged: boolean;
}

/** The outcome of {@link apply}: the effect, or why nothing was done. */
export type Outcome = { ok: true; effect: Effect } | { ok: false; error: string };

/** What {@link apply} needs from outside the core. */
export interface ApplyContext {
	/** Makes the surfaces new layers need. */
	surfaces: SurfaceFactory;
}

/**
 * Apply `command` to `doc`. It is validated first; if anything is wrong the
 * document is left exactly as it was and the outcome says why, in one
 * sentence the interface can toast (all or nothing).
 */
export function apply(doc: Document, command: Command, context: ApplyContext): Outcome {
	const error = validate(doc, command);
	if (error !== null) {
		return { ok: false, error };
	}
	switch (command.op) {
		case "add_layer":
			return { ok: true, effect: addLayer(doc, command, context) };
		case "delete_layer":
			return { ok: true, effect: deleteLayer(doc, command) };
		case "set_layer_props":
			return { ok: true, effect: setLayerProps(doc, command) };
		case "fill_layer":
			return { ok: true, effect: fillLayer(doc, command) };
	}
}

/**
 * Why `command` cannot be applied to `doc`, or `null` when it can. Checks
 * everything the command's apply function relies on, so that function never
 * fails halfway.
 */
export function validate(doc: Document, command: Command): string | null {
	switch (command.op) {
		case "add_layer":
			if (command.name !== undefined && typeof command.name !== "string") {
				return "The layer's name must be text.";
			}
			return null;
		case "delete_layer": {
			const place = findLayer(doc, command.layer.id);
			if (!place) {
				return "That layer does not exist.";
			}
			// VERIFY: Photoshop disables Delete Layer when one layer is left.
			if (countLayers(doc) <= 1) {
				return "A document must keep at least one layer.";
			}
			return null;
		}
		case "set_layer_props": {
			if (!findLayer(doc, command.layer.id)) {
				return "That layer does not exist.";
			}
			const { visible, opacity, name } = command.props;
			if (visible !== undefined && typeof visible !== "boolean") {
				return "Visibility must be on or off.";
			}
			if (opacity !== undefined && (typeof opacity !== "number" || !(opacity >= 0 && opacity <= 1))) {
				return "Opacity must be between 0 and 100 %.";
			}
			if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
				return "A layer needs a name.";
			}
			if (visible === undefined && opacity === undefined && name === undefined) {
				return "Nothing to change.";
			}
			return null;
		}
		case "fill_layer": {
			const place = findLayer(doc, command.layer.id);
			if (!place) {
				return "That layer does not exist.";
			}
			if (place.layer.kind !== "pixel") {
				// Photoshop's wording for a fill on a non-pixel layer.
				return "Could not fill because the target layer is not a pixel layer.";
			}
			if (!isRgba16(command.color)) {
				return "The colour is not valid.";
			}
			if (command.rect && !isWholeRect(command.rect)) {
				return "The area to fill is not valid.";
			}
			return null;
		}
	}
}

function isRgba16(color: unknown): color is Rgba16 {
	return Array.isArray(color) && color.length === 4 && color.every((c) => Number.isInteger(c) && c >= 0 && c <= 65535);
}

/** 16-bit channel → 8-bit, rounded. */
function to8(color: Rgba16): Rgba8 {
	return [Math.round(color[0] / 257), Math.round(color[1] / 257), Math.round(color[2] / 257), Math.round(color[3] / 257)];
}

/** Photoshop's "Layer N": one more than the highest N already used. */
function nextLayerName(doc: Document): string {
	let highest = 0;
	const walk = (list: Layer[]): void => {
		for (const layer of list) {
			const match = /^Layer (\d+)$/.exec(layer.name);
			if (match?.[1]) {
				highest = Math.max(highest, Number(match[1]));
			}
			if (layer.kind === "group") {
				walk(layer.children);
			}
		}
	};
	walk(doc.layers);
	return `Layer ${highest + 1}`;
}

function addLayer(doc: Document, command: AddLayerCommand, context: ApplyContext): Effect {
	const id = doc.nextLayerId++;
	const layer = createPixelLayer(id, command.name ?? nextLayerName(doc), context.surfaces.create(doc.width, doc.height, "rgba8"));
	const active = doc.activeLayer === null ? null : findLayer(doc, doc.activeLayer);
	if (active) {
		active.siblings.splice(active.index + 1, 0, layer);
	} else {
		doc.layers.push(layer);
	}
	doc.activeLayer = id;
	return { label: "New Layer", pixelsChanged: [], propsChanged: false, structureChanged: true };
}

function deleteLayer(doc: Document, command: DeleteLayerCommand): Effect {
	const place = findLayer(doc, command.layer.id);
	if (place) {
		place.siblings.splice(place.index, 1);
		if (doc.activeLayer === command.layer.id) {
			// VERIFY: Photoshop activates the layer below, or the one above
			// when the bottom one was deleted.
			const next = place.siblings[Math.max(0, place.index - 1)] ?? place.siblings[place.index] ?? doc.layers[doc.layers.length - 1];
			doc.activeLayer = next ? next.id : null;
		}
	}
	return { label: "Delete Layer", pixelsChanged: [], propsChanged: false, structureChanged: true };
}

function setLayerProps(doc: Document, command: SetLayerPropsCommand): Effect {
	const place = findLayer(doc, command.layer.id);
	const { visible, opacity, name } = command.props;
	if (place) {
		if (visible !== undefined) {
			place.layer.visible = visible;
		}
		if (opacity !== undefined) {
			place.layer.opacity = opacity;
		}
		if (name !== undefined) {
			place.layer.name = name;
		}
	}
	// Photoshop's labels, one per property; several at once are "Layer Properties".
	// VERIFY: "Layer Visibility" is recorded only with History Options ▸ "Make
	// Layer Visibility Changes Undoable"; R-photo always records it.
	const changed = [visible, opacity, name].filter((v) => v !== undefined).length;
	const label = changed > 1 ? "Layer Properties"
		: visible !== undefined ? "Layer Visibility"
		: opacity !== undefined ? "Opacity Change"
		: "Rename Layer";
	return { label, pixelsChanged: [], propsChanged: true, structureChanged: false };
}

function fillLayer(doc: Document, command: FillLayerCommand): Effect {
	const place = findLayer(doc, command.layer.id);
	if (!place || place.layer.kind !== "pixel") {
		return { label: "Fill", pixelsChanged: [], propsChanged: false, structureChanged: false };
	}
	const layer = place.layer;
	const rect = intersect(command.rect ?? boundsOf(layer.pixels), boundsOf(layer.pixels));
	if (!isEmpty(rect)) {
		layer.pixels.draw({ op: "fill", rect, color: to8(command.color) });
	}
	const documentRect = { x: rect.x + layer.offset.x, y: rect.y + layer.offset.y, width: rect.width, height: rect.height };
	return { label: "Fill", pixelsChanged: [{ layer: layer.id, rect: documentRect }], propsChanged: false, structureChanged: false };
}
