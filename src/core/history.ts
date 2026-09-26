import type { Document } from "./document";
import { snapshotLayer } from "./layer";
import type { Layer, LayerId } from "./layer";

/**
 * The document's history (Photoshop's History panel): the state the document
 * was opened in, then one state per command, each with Photoshop's label.
 *
 * Each state is a snapshot of the layer tree whose surfaces are copy-on-write
 * snapshots: a state shares every surface its command did not change with the
 * states around it, so memory grows with what the edits touched, not with the
 * document's size times the number of states.
 */

/** Photoshop's default number of history states (Preferences ▸ Performance ▸ History States). */
export const DEFAULT_HISTORY_STATES = 50;

/** What a state restores: the layer tree and everything the commands may change outside it. */
interface Snapshot {
	layers: Layer[];
	activeLayer: LayerId | null;
	width: number;
	height: number;
	nextLayerId: LayerId;
}

/** One row of the History panel. */
interface State {
	label: string;
	snapshot: Snapshot;
}

function take(doc: Document): Snapshot {
	return {
		layers: doc.layers.map(snapshotLayer),
		activeLayer: doc.activeLayer,
		width: doc.width,
		height: doc.height,
		nextLayerId: doc.nextLayerId,
	};
}

function restore(doc: Document, snapshot: Snapshot): void {
	// Snapshot again on the way out, so edits after an undo never reach the
	// stored state.
	doc.layers = snapshot.layers.map(snapshotLayer);
	doc.activeLayer = snapshot.activeLayer;
	doc.width = snapshot.width;
	doc.height = snapshot.height;
	// Ids are never reused, even for layers an undo removed.
	doc.nextLayerId = Math.max(doc.nextLayerId, snapshot.nextLayerId);
}

/** A document's history. */
export class History {
	/** The state the document was opened in: the panel's first row, never dropped. */
	private readonly opened: State;
	/** The states after it, oldest first. */
	private states: State[] = [];
	/** Which state the document shows: 0 is "opened", n is `states[n - 1]`. */
	private currentIndex = 0;
	/** How many states are kept after the opening one. */
	limit: number;

	/** The history of `doc` as it is now; `openLabel` is the first row's name (Photoshop: "Open", or "New" for a new document). */
	constructor(doc: Document, openLabel = "Open", limit = DEFAULT_HISTORY_STATES) {
		this.opened = { label: openLabel, snapshot: take(doc) };
		this.limit = limit;
	}

	/**
	 * Record the state after a command. States after the current one (the
	 * grey, undone ones) are dropped, as Photoshop drops them on a new edit;
	 * beyond {@link limit} the oldest go.
	 */
	record(doc: Document, label: string): void {
		this.states = this.states.slice(0, this.currentIndex);
		this.states.push({ label, snapshot: take(doc) });
		if (this.states.length > this.limit) {
			this.states = this.states.slice(this.states.length - this.limit);
		}
		this.currentIndex = this.states.length;
	}

	/** Step back; false when already at the first state. */
	undo(doc: Document): boolean {
		return this.jumpTo(doc, this.currentIndex - 1);
	}

	/** Step forward; false when already at the last state. */
	redo(doc: Document): boolean {
		return this.jumpTo(doc, this.currentIndex + 1);
	}

	/** Show state `index` (0 = the opening state). False when out of range or already there. */
	jumpTo(doc: Document, index: number): boolean {
		if (index < 0 || index > this.states.length || index === this.currentIndex) {
			return false;
		}
		const state = index === 0 ? this.opened : this.states[index - 1];
		if (!state) {
			return false;
		}
		restore(doc, state.snapshot);
		this.currentIndex = index;
		return true;
	}

	/** The label of the state Undo would go back over (Edit ▸ Undo <label>), or null. */
	get undoLabel(): string | null {
		return this.currentIndex > 0 ? (this.states[this.currentIndex - 1]?.label ?? null) : null;
	}

	/** The label of the state Redo would reach, or null. */
	get redoLabel(): string | null {
		return this.states[this.currentIndex]?.label ?? null;
	}

	/** The History panel's rows after the first, oldest first. */
	get labels(): string[] {
		return this.states.map((s) => s.label);
	}

	/** The panel's first row. */
	get openLabel(): string {
		return this.opened.label;
	}

	/** The row shown: 0 is the first row. */
	get current(): number {
		return this.currentIndex;
	}
}
