import { defineConfig } from "vite";

/**
 * R-photo's build.
 *
 * The interface (`ui/`, Fotox's) is the app: one `index.html`, plain CSS and
 * JavaScript modules, plus the TypeScript the cards add under `src/`. The
 * engine is a **module worker** the interface starts itself
 * (`new Worker(new URL("../../src/engine/worker.ts", import.meta.url), { type: "module" })`,
 * W0-T03); Vite bundles it and keeps it a separate chunk, so `build` is still
 * a folder of static files that can be served from anywhere (D-002).
 *
 * `base: "./"` makes those files work from a sub-path (a GitHub Pages branch,
 * a `file://` preview) as Photopea does.
 */
export default defineConfig({
	root: "ui",
	base: "./",
	publicDir: false,
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		target: "es2023",
		sourcemap: true,
	},
	worker: {
		format: "es",
	},
	server: {
		port: 5173,
		// Sources live outside `root` (`src/` is a sibling of `ui/`), so the dev
		// server is told about the project directory.
		fs: { allow: [".."] },
	},
});
