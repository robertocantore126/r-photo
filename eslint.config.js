import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The Surface rule (ROADMAP §3 rule 1): canvases and raw pixel buffers live in
 * exactly two places — the Surface implementations and the viewport that the
 * engine draws into. Everything else reads and writes pixels through the
 * `Surface` interface, which is what keeps W10 (tiles, 16-bit, OPFS) from
 * touching the tools and the filters.
 */
const CANVAS_FILES = ["src/core/raster/**", "src/engine/viewport.ts"];

/** The parts of the program that must not know a DOM or a worker exists
 * (ROADMAP §3 rule 6): the core, the tools, the filters and the file formats
 * take their inputs as arguments, which is what makes W12's tests headless. */
const CORE_FILES = ["src/core/**", "src/tools/**", "src/filters/**", "src/io/**"];

const CANVAS_MESSAGE = "Pixels are reachable only through the Surface interface (ROADMAP §3 rule 1)";
const DOM_MESSAGE = "The core takes its inputs as arguments; it must not know about the DOM (ROADMAP §3 rule 6)";

const CANVAS_GLOBALS = [
	{ name: "OffscreenCanvas", message: CANVAS_MESSAGE },
	{ name: "ImageData", message: CANVAS_MESSAGE },
];
const DOM_GLOBALS = [
	{ name: "document", message: DOM_MESSAGE },
	{ name: "window", message: DOM_MESSAGE },
	{ name: "self", message: DOM_MESSAGE },
	{ name: "navigator", message: DOM_MESSAGE },
	{ name: "localStorage", message: DOM_MESSAGE },
];

export default tseslint.config(
	{
		ignores: ["dist/**", "node_modules/**", "coverage/**", "**/*.min.js"],
	},

	js.configs.recommended,
	...tseslint.configs.recommended,

	/* Fotox's interface: plain JavaScript modules in the browser (and the
	   build scripts, which are Node). */
	{
		files: ["**/*.js", "**/*.mjs"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: { ...globals.browser, ...globals.node },
		},
	},

	/* TypeScript: the recommended set, plus the type-aware rules that pay for
	   themselves (the card's "strict type-checked where cheap"). */
	{
		files: ["**/*.ts"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": "error",
			"@typescript-eslint/require-await": "error",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			// The card's rule: no `any` without a comment saying why.
			"@typescript-eslint/no-explicit-any": "warn",
			"no-console": "off",
		},
	},

	/* The Surface rule, everywhere but the two places it is allowed. */
	{
		files: ["src/**/*.ts", "ui/**/*.js"],
		ignores: CANVAS_FILES,
		rules: {
			"no-restricted-globals": ["error", ...CANVAS_GLOBALS],
			"no-restricted-syntax": [
				"error",
				{
					selector: "MemberExpression[property.name='getContext']",
					message: CANVAS_MESSAGE,
				},
				{
					selector: "MemberExpression[property.name='getImageData']",
					message: CANVAS_MESSAGE,
				},
				{
					selector: "MemberExpression[property.name='putImageData']",
					message: CANVAS_MESSAGE,
				},
				{
					selector: "MemberExpression[property.name='transferToImageBitmap']",
					message: CANVAS_MESSAGE,
				},
			],
		},
	},

	/* No DOM in the core. `src/core/raster/` is the Surface implementation, so
	   it is the one place under `src/core` that may build a canvas. */
	{
		files: CORE_FILES,
		ignores: ["src/core/raster/**"],
		rules: {
			// Both lists: a later block replaces a rule, it does not extend it, so
			// the canvas rule has to be repeated here to stay in force.
			"no-restricted-globals": ["error", ...CANVAS_GLOBALS, ...DOM_GLOBALS],
		},
	},
);
