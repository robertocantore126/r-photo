import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * The interface reads its icon sprite at runtime (`assets/icons.svg`, see
 * `ui/js/icons.js`) instead of importing it, so the bundler has no reason to
 * know the file exists and a production build would leave the icons blank.
 *
 * This emits `ui/assets/` as `assets/` in the output. The URL stays relative
 * to the page, so it keeps working from a sub-path (`base: "./"`) as well as
 * from a server root.
 */
function interfaceAssets(): Plugin {
	const directory = fileURLToPath(new URL("./ui/assets", import.meta.url));
	return {
		name: "r-photo:interface-assets",
		generateBundle() {
			for (const name of readdirSync(directory)) {
				const file = join(directory, name);
				if (!statSync(file).isFile()) {
					continue;
				}
				this.emitFile({ type: "asset", fileName: `assets/${name}`, source: readFileSync(file) });
			}
		},
	};
}

/**
 * R-photo's build.
 *
 * The interface (`ui/`, Fotox's) is the app: one `index.html`, its CSS and its
 * JavaScript modules, plus the TypeScript the cards add under `src/`. The
 * engine is a **module worker** the interface starts itself (W0-T03); Vite
 * bundles it into its own chunk, so `build` stays a folder of static files
 * that can be served from anywhere (D-002).
 */
export default defineConfig({
	root: "ui",
	base: "./",
	publicDir: false,
	plugins: [interfaceAssets()],
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
