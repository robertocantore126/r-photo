import type { Modifiers, PointerMessage, WheelMessage } from "./protocol";
import type { View } from "./view";

/**
 * Viewport navigation: the Hand and Zoom tools, Space (Photoshop's temporary
 * Hand, with Ctrl / Alt its temporary Zoom), the middle button and the wheel.
 * It turns pointer and wheel messages into {@link View} changes; the other
 * tools arrive in W2 and get the pointer when navigation does not take it.
 */
export class Navigation {
	private panning: { x: number; y: number } | null = null;

	/**
	 * A pointer message. Returns `true` when the view changed (redraw), and
	 * sets {@link consumed} when navigation took the event, so a tool does not.
	 */
	pointer(view: View, tool: string, message: PointerMessage): boolean {
		this.consumed = false;
		switch (message.kind) {
			case "down":
				return this.down(view, tool, message);
			case "move":
				if (!this.panning) {
					return false;
				}
				this.consumed = true;
				return this.panTo(view, message.x, message.y);
			case "up":
			case "cancel":
			case "leave":
				if (!this.panning) {
					return false;
				}
				this.consumed = true;
				this.panning = null;
				return false;
		}
	}

	/** The last {@link pointer} call was navigation's: the active tool must not see it. */
	consumed = false;

	/** True while a Hand drag is in progress. */
	get isPanning(): boolean {
		return this.panning !== null;
	}

	/**
	 * The wheel, as Photoshop on Windows: it scrolls vertically, Shift + wheel
	 * horizontally, Alt + wheel zooms about the pointer. Ctrl + wheel also
	 * zooms, because that is how the browser delivers a trackpad pinch
	 * (Photoshop's Ctrl + wheel scrolls horizontally). A trackpad's two-finger
	 * scroll gives both deltas and pans freely. `dpr` is the viewport's
	 * device pixels per CSS pixel.
	 * VERIFY: Photoshop's "Zoom with Scroll Wheel" preference (off by default)
	 * swaps the plain wheel and Alt + wheel.
	 */
	wheel(view: View, message: WheelMessage, dpr: number): boolean {
		const at = { x: message.x, y: message.y };
		if (message.modifiers.alt || message.modifiers.ctrl) {
			// In CSS pixels, so a notch zooms as much at 150 % scaling as at 100 %.
			return view.wheelZoom(message.dy / dpr, at);
		}
		if (message.modifiers.shift && message.dx === 0) {
			return view.panBy(-message.dy, 0);
		}
		return view.panBy(-message.dx, -message.dy);
	}

	private down(view: View, tool: string, message: PointerMessage): boolean {
		const at = { x: message.x, y: message.y };
		const mods = message.modifiers;
		// Middle button: pan, whatever the tool.
		if (message.button === 1) {
			return this.startPan(message);
		}
		if (message.button !== 0) {
			return false;
		}
		if (mods.space && (mods.ctrl || mods.alt)) {
			// Ctrl + Space / Alt + Space: the temporary Zoom tool.
			this.consumed = true;
			return mods.alt ? view.zoomOut(at) : view.zoomIn(at);
		}
		if (mods.space || tool === "hand") {
			return this.startPan(message);
		}
		if (tool === "zoom") {
			// A click zooms in to the next preset about the point; Alt zooms
			// out. VERIFY: Photoshop's Scrubby Zoom (drag) is W2-T11.
			this.consumed = true;
			return zoomOutWith(mods) ? view.zoomOut(at) : view.zoomIn(at);
		}
		return false;
	}

	private startPan(message: PointerMessage): boolean {
		this.consumed = true;
		this.panning = { x: message.x, y: message.y };
		return false;
	}

	private panTo(view: View, x: number, y: number): boolean {
		if (!this.panning) {
			return false;
		}
		const dx = x - this.panning.x;
		const dy = y - this.panning.y;
		this.panning = { x, y };
		return view.panBy(dx, dy);
	}
}

/** The Zoom tool zooms out with Alt held (Photoshop's Zoom Out mode is W2-T11). */
function zoomOutWith(mods: Modifiers): boolean {
	return mods.alt;
}
