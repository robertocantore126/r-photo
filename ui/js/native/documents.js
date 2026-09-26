// Fotox — document tabs in native mode (M1-T08); File ▸ New, Open and
// Export with the engine worker (R-photo, W0-T07).
//
// The engine owns the documents: tabs are created, updated and removed from
// its `document_opened` / `document_changed` / `document_closed` /
// `active_document` / `view` messages. A tab click sends
// `activate_document`, its close button `close_document`.
//
// What only the page can do stays here: the New dialog (and the clipboard
// it reads for its Clipboard preset), the file pickers, dropping files on the
// window, and writing an exported file (File System Access API, or a
// download).

import { h, icon } from "../el.js";
import { state } from "../state.js";
import { status, toast } from "../tooltip.js";
import { openDialog } from "../dialogs.js";
import { dialogDef } from "../data/dialogs.js";
import * as bridge from "./bridge.js";
import { UI, ENGINE } from "./protocol.js";
import { openableAccept } from "../../../src/io/open.ts";

const docs = new Map(); // doc id → { info, zoom, tab }
let active = null;
let strip = null;
let addButton = null;

/** Take over the tab strip `tabs`; `add` is the "+" button kept at its end. */
export function initDocumentTabs(tabs, add) {
  strip = tabs;
  addButton = add;
  strip.replaceChildren(addButton);

  bridge.on(ENGINE.DOCUMENT_OPENED, ({ info }) => {
    const tab = h("div", { class: "doctab", "data-doc": String(info.doc), onclick: () => bridge.send({ type: UI.ACTIVATE_DOCUMENT, doc: info.doc }) },
      icon("i-image", "ic sm"),
      h("span", { class: "doctab-label" }),
      h("button", {
        class: "doctab-x", type: "button", "data-tip": "Close document",
        onclick: (e) => { e.stopPropagation(); bridge.send({ type: UI.CLOSE_DOCUMENT, doc: info.doc }); },
      }, icon("i-close", "ic xs")));
    strip.insertBefore(tab, addButton);
    docs.set(info.doc, { info, zoom: null, tab });
    refresh(info.doc);
  });

  bridge.on(ENGINE.DOCUMENT_CHANGED, ({ info }) => {
    const d = docs.get(info.doc);
    if (!d) return;
    d.info = info;
    refresh(info.doc);
  });

  bridge.on(ENGINE.DOCUMENT_CLOSED, ({ doc }) => {
    const d = docs.get(doc);
    if (!d) return;
    d.tab.remove();
    docs.delete(doc);
  });

  bridge.on(ENGINE.ACTIVE_DOCUMENT, ({ doc }) => {
    active = doc;
    for (const [id, d] of docs) d.tab.classList.toggle("active", id === doc);
    const d = doc == null ? null : docs.get(doc);
    const size = document.getElementById("statusdocsize");
    if (size) size.textContent = d ? `${d.info.width} × ${d.info.height} px` : "";
  });

  bridge.on(ENGINE.VIEW, (view) => {
    const d = docs.get(view.doc);
    if (!d) return;
    d.zoom = view.zoom * 100;
    refresh(view.doc);
  });

  // Closing an unsaved document: Save / Don't Save / Cancel (M3-T06).
  bridge.on(ENGINE.CLOSE_DIRTY_DOCUMENT, ({ doc, name }) => {
    const answer = (value) => bridge.send({ type: UI.CLOSE_DOCUMENT_ANSWER, doc, answer: value });
    openDialog("save-changes", {
      fields: [{ type: "label", text: `Save changes to “${name}” before closing?` }],
      buttons: [
        { text: "Save", primary: true, onClick: () => answer("save") },
        { text: "Don't Save", onClick: () => answer("dont_save") },
        { text: "Cancel", onClick: () => answer("cancel") },
      ],
      onCancel: () => answer("cancel"),
    });
  });

  // An export the engine encoded: write it where the user chose.
  bridge.on(ENGINE.SAVE_FILE, (message) => { saveFile(message); });
  initFileDrop();

  // Long jobs (import, save, export): progress in the status bar.
  bridge.on(ENGINE.PROGRESS, ({ label, fraction }) => status(`${label}… ${Math.round(fraction * 100)} %`));
  bridge.on(ENGINE.PROGRESS_DONE, () => status("Ready"));
}

/** The id of the active document, or null. */
export function activeDocument() {
  return active;
}

/** What the engine last reported about the active document (size, ppi, …), or null. */
export function activeDocumentInfo() {
  const d = active == null ? null : docs.get(active);
  return d ? d.info : null;
}

function refresh(id) {
  const d = docs.get(id);
  if (!d) return;
  const { info } = d;
  const zoom = d.zoom == null ? "" : ` @ ${formatZoom(d.zoom)}%`;
  const bits = info.depth === "u16" || info.depth === "U16" ? 16 : 8;
  const label = `${info.name}${zoom} (RGB/${bits})${info.dirty ? "*" : ""}`;
  d.tab.querySelector(".doctab-label").textContent = label;
  d.tab.title = `${info.name} — ${info.width} × ${info.height} px, ${info.profile_name}, ${Math.round(info.ppi)} ppi`;
  if (id === active) state.doc = { ...state.doc, name: info.name, w: info.width, h: info.height, bits };
}

function formatZoom(z) {
  return z < 10 ? String(Math.round(z * 100) / 100) : String(Math.round(z));
}

/* ------------------------------------------------------------ File ▸ New */

// Photoshop's units, in pixels per unit at `ppi` pixels per inch.
const UNITS = {
  Pixels: () => 1,
  Inches: (ppi) => ppi,
  Centimetres: (ppi) => ppi / 2.54,
  Millimetres: (ppi) => ppi / 25.4,
  Points: (ppi) => ppi / 72,
  Picas: (ppi) => ppi / 6,
};

const BACKGROUNDS = { White: "white", Black: "black", "Background Colour": "background", Transparent: "transparent" };

let untitled = 0; // "Untitled-N" names given so far (Photoshop counts per session)

/** The size of the image on the clipboard, or null (no image, refused, no API). */
async function clipboardImageSize() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) return null;
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const bitmap = await createImageBitmap(await item.getType(type));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    // Refused or empty.
  }
  return null;
}

/**
 * Whether the clipboard may be read without asking: "granted", "prompt"
 * (reading would show Chrome's permission prompt) or "denied".
 */
async function clipboardPermission() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) return "denied";
    const status = await navigator.permissions.query({ name: "clipboard-read" });
    return status.state;
  } catch {
    return "prompt";
  }
}

// The input of the dialog line labelled `label` (Width:, Height:, Name: …).
function inputOf(wrap, label) {
  const line = [...wrap.querySelectorAll(".dlg-line")].find((l) => {
    const text = l.querySelector(".dlg-field-label");
    return text && text.textContent === label;
  });
  return line ? line.querySelector("input") : null;
}

/**
 * File ▸ New (Ctrl+N): Fotox's dialog, made live. The presets fill the size.
 * Clipboard: when the page may read the clipboard, its image's size is read
 * at once and the preset chosen if there is one (Photoshop's behaviour); when
 * Chrome would have to ask, the preset reads the clipboard when clicked, so
 * the dialog never waits on a permission prompt.
 */
export function openNewDocumentDialog() {
  const withLive = (fields) => fields.flatMap((f) => {
    if (f.type === "presets") {
      const items = f.items.filter(([name]) => name !== "Clipboard");
      return [{ ...f, items: [["Clipboard", "—"], ...items] }];
    }
    if (f.type === "text" && f.label === "Name:") return [{ ...f, value: `Untitled-${untitled + 1}` }];
    // Photoshop's dialog has a Resolution field; Fotox's did not need one.
    if (f.type === "check" && f.label === "Constrain proportions") {
      return [{ type: "num", label: "Resolution:", value: 72, unit: "ppi", w: 90 }, f];
    }
    return f.fields ? [{ ...f, fields: withLive(f.fields) }] : [f];
  });
  const def = dialogDef("new-doc");
  let wrap = null;
  wrap = openDialog("new-doc", {
    fields: withLive(def.fields || []),
    onOk: (v) => {
      const ppi = Number(v["Resolution:"]) > 0 ? Number(v["Resolution:"]) : 72;
      const perUnit = (UNITS[v["Units:"]] || UNITS.Pixels)(ppi);
      const nameBox = wrap && inputOf(wrap, "Name:");
      const name = nameBox ? nameBox.value.trim() : "";
      if (name === `Untitled-${untitled + 1}`) untitled += 1;
      bridge.send({
        type: UI.ACTION, id: "doc:new",
        args: {
          name,
          width: Math.round(Number(v["Width:"]) * perUnit),
          height: Math.round(Number(v["Height:"]) * perUnit),
          ppi,
          background: BACKGROUNDS[v["Background Contents:"]] || "white",
        },
      });
    },
  });
  // A preset row sets the size in pixels.
  const setSize = (text) => {
    const m = /(\d+)\s*×\s*(\d+)/.exec(text);
    const width = inputOf(wrap, "Width:");
    const height = inputOf(wrap, "Height:");
    if (!m || !width || !height) return;
    width.value = m[1];
    height.value = m[2];
    const units = [...wrap.querySelectorAll(".dlg-line")].find((l) => (l.querySelector(".dlg-field-label") || {}).textContent === "Units:");
    const shown = units && units.querySelector(".dlg-select .pf-value");
    if (shown) shown.textContent = "Pixels";
  };
  const rows = [...wrap.querySelectorAll(".preset-row")];
  const clipRow = rows[0];
  const clipSize = clipRow.querySelector(".preset-size");
  const choose = (row) => {
    rows.forEach((r) => r.classList.toggle("sel", r === row));
    setSize(row.querySelector(".preset-size").textContent);
  };
  const readClipboard = async (select) => {
    const size = await clipboardImageSize();
    clipSize.textContent = size ? `${size.width} × ${size.height}` : "no image";
    if (size && select && wrap.isConnected) choose(clipRow);
  };
  rows.forEach((row) => row.addEventListener("click", () => {
    if (row === clipRow) { readClipboard(true); return; }
    choose(row);
  }));
  const standard = rows.find((r, i) => i > 0 && r.classList.contains("sel")) || rows[1];
  if (standard) choose(standard);
  clipboardPermission().then((permission) => {
    if (permission === "granted") readClipboard(true);
    else if (permission === "denied") clipRow.remove();
    else clipSize.textContent = "click to read";
  });
}

/* ----------------------------------------------------------- File ▸ Open */

/** Send files to the engine: one document each. */
function sendFiles(files) {
  const list = [...files];
  if (list.length) bridge.send({ type: UI.OPEN_FILES, files: list });
}

/**
 * File ▸ Open (Ctrl+O): the File System Access picker where the browser has
 * one, a plain file input otherwise. Several files at once.
 */
export async function openFilesDialog() {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: "Images", accept: openableAccept() }],
      });
      sendFiles(await Promise.all(handles.map((handle) => handle.getFile())));
    } catch (error) {
      if (error && error.name !== "AbortError") toast("The file could not be opened.", "error");
    }
    return;
  }
  const input = h("input", { type: "file", multiple: true, accept: Object.values(openableAccept()).flat().join(",") });
  input.addEventListener("change", () => sendFiles(input.files || []));
  input.click();
}

// Files dropped anywhere on the window open as documents (Photoshop's drop on
// the tab bar or an empty workspace).
function initFileDrop() {
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    sendFiles(e.dataTransfer.files);
  });
}

/* --------------------------------------------------------- File ▸ Export */

const EXPORT_TYPES = {
  png: { description: "PNG image", mime: "image/png", ext: ".png" },
  jpg: { description: "JPEG image", mime: "image/jpeg", ext: ".jpg" },
  webp: { description: "WebP image", mime: "image/webp", ext: ".webp" },
};

let exportRequest = 0;
const pendingSaves = new Map(); // request → the file handle to write, or null for a download

/**
 * Export the active document as `format` (png, jpg, webp) at `quality`
 * (0–100). Where the browser allows, the save dialog is shown first (it needs
 * the click that asked for it); the engine then encodes and sends the file.
 */
export async function exportDocument(format, quality = 90) {
  const info = activeDocumentInfo();
  if (!info) { toast("Open a document first"); return; }
  const type = EXPORT_TYPES[format];
  const request = ++exportRequest;
  let handle = null;
  if (window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: info.name.replace(/\.[a-z0-9]{1,5}$/i, "") + type.ext,
        types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }],
      });
    } catch (error) {
      if (error && error.name === "AbortError") return;
      handle = null; // no picker after all: download
    }
  }
  pendingSaves.set(request, handle);
  bridge.send({ type: UI.ACTION, id: "export:as", args: { format, quality, request } });
}

/**
 * File ▸ Export As… and File ▸ Export as ▸ PNG… / JPG… / WebP…: the format
 * (chosen from the menu item's `label` when it names one) and the quality.
 */
export function openExportDialog(label = "") {
  if (!activeDocumentInfo()) { toast("Open a document first"); return; }
  const named = ["PNG", "JPG", "WebP"].find((f) => label.startsWith(f));
  openDialog("export-as", {
    fields: [{ type: "col", fields: [
      { type: "select", label: "Format:", options: ["PNG", "JPG", "WebP"], value: named || "PNG" },
      { type: "range", label: "Quality:", value: 90, min: 0, max: 100 },
    ] }],
    onOk: (v) => exportDocument({ JPG: "jpg", WebP: "webp" }[v["Format:"]] || "png", Number(v["Quality:"])),
  });
}

async function saveFile({ request, name, blob }) {
  const handle = pendingSaves.get(request);
  pendingSaves.delete(request);
  try {
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      toast(`Exported “${handle.name}”`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`Exported “${name}”`);
  } catch (error) {
    console.error("r-photo: saving the export", error);
    toast("The file could not be written.", "error");
  }
}
