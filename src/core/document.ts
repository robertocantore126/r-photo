import type { Layer, LayerId } from "./layer";

/**
 * A document (`docs/ARCHITECTURE.md` §4), as Fotox's
 * `fx-core/src/document.rs` and Photoshop have it. The factory's shape
 * follows BitMappery's `document-factory.ts` (MIT, Igor Zinken): `create`
 * with every default spelled out.
 *
 * The engine owns documents; the core changes them only through commands
 * (`command.ts`), and the history restores them (`history.ts`).
 */
export interface Document {
	/** Width, pixels. */
	width: number;
	/** Height, pixels. */
	height: number;
	/** Resolution, pixels per inch (Image Size, Print Size). */
	ppi: number;
	/** The colour profile's name. W0 works in sRGB. */
	colorProfile: string;
	/** The layer tree, **bottom → top** (index 0 is the bottom layer, as Photoshop counts). */
	layers: Layer[];
	/** The active layer (the one painting and filters act on), or `null` when there are no layers. */
	activeLayer: LayerId | null;
	/** The selection: a gray Surface from W2 (W2-T00); `null` is "no selection". */
	selection: null;
	/** Guides, document pixels (W2-T11). */
	guides: { horizontal: number[]; vertical: number[] };
	/** Alpha channels (W7-T00: document data). */
	channels: unknown[];
	/** The next free layer id; ids are never reused in a document. */
	nextLayerId: LayerId;
}

/** A new empty document. The caller adds the layers (W0-T07: a Background). */
export function createDocument(width: number, height: number, ppi = 72): Document {
	return {
		width,
		height,
		ppi,
		colorProfile: "sRGB IEC61966-2.1",
		layers: [],
		activeLayer: null,
		selection: null,
		guides: { horizontal: [], vertical: [] },
		channels: [],
		nextLayerId: 1,
	};
}

/** Where a layer is: the list that holds it and its index there. */
export interface LayerPlace {
	layer: Layer;
	/** The list it is in (the document's, or a group's children). */
	siblings: Layer[];
	index: number;
	/** How many groups it is inside (0 at the top level). */
	depth: number;
}

/** Find a layer anywhere in the tree. */
export function findLayer(doc: Document, id: LayerId): LayerPlace | null {
	const walk = (list: Layer[], depth: number): LayerPlace | null => {
		for (let index = 0; index < list.length; index++) {
			const layer = list[index];
			if (!layer) {
				continue;
			}
			if (layer.id === id) {
				return { layer, siblings: list, index, depth };
			}
			if (layer.kind === "group") {
				const found = walk(layer.children, depth + 1);
				if (found) {
					return found;
				}
			}
		}
		return null;
	};
	return walk(doc.layers, 0);
}

/** Every layer, top → bottom as the Layers panel lists them, with its depth. */
export function layersTopDown(doc: Document): { layer: Layer; depth: number }[] {
	const out: { layer: Layer; depth: number }[] = [];
	const walk = (list: Layer[], depth: number): void => {
		for (let index = list.length - 1; index >= 0; index--) {
			const layer = list[index];
			if (!layer) {
				continue;
			}
			out.push({ layer, depth });
			if (layer.kind === "group") {
				walk(layer.children, depth + 1);
			}
		}
	};
	walk(doc.layers, 0);
	return out;
}

/** How many layers the document has, groups and their contents included. */
export function countLayers(doc: Document): number {
	return layersTopDown(doc).length;
}
