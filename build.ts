/**
 * Builds the extension into dist/ (production) or dist-e2e/ (--e2e: reMarkable,
 * Google Docs and SharePoint hosts point at the local fake server).
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./src/core/config";

const e2e = process.argv.includes("--e2e");
const outdir = e2e ? "dist-e2e" : "dist";
const fakeOrigin = process.env.E2E_FAKE_ORIGIN ?? "http://127.0.0.1:8787";

const config: Partial<Config> = e2e
	? {
			remarkable: {
				authHost: fakeOrigin,
				rawHost: fakeOrigin,
				uploadHost: fakeOrigin,
			},
			googleDocsOrigin: fakeOrigin,
			sharepointSuffix: new URL(fakeOrigin).hostname,
			origins: {
				google: ["http://127.0.0.1/*"],
				microsoft: ["http://127.0.0.1/*"],
				allSites: ["http://127.0.0.1/*"],
			},
			e2eHooks: true,
		}
	: {};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const define = { __CONFIG__: JSON.stringify(config) };

async function bundle(
	entrypoints: string[],
	format: "esm" | "iife",
): Promise<void> {
	const result = await Bun.build({
		entrypoints,
		outdir,
		target: "browser",
		format,
		splitting: false,
		minify: false,
		naming: "[name].[ext]",
		define,
	});
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		throw new Error(`build failed for ${entrypoints.join(", ")}`);
	}
}

// Content scripts are classic scripts; everything else loads as a module.
await bundle(["src/content/extract.ts"], "iife");
await bundle(
	[
		"src/background/index.ts",
		"src/popup/popup.ts",
		"src/options/options.ts",
		"src/upload/upload.ts",
	],
	"esm",
);
// Bun names the background bundle after its file; the manifest expects background.js.
await cp(join(outdir, "index.js"), join(outdir, "background.js"));
await rm(join(outdir, "index.js"));

for (const dir of ["popup", "options", "upload", "ui"]) {
	for (const file of await readdir(join("src", dir))) {
		if (file.endsWith(".html") || file.endsWith(".css")) {
			await cp(join("src", dir, file), join(outdir, file));
		}
	}
}

await cp("src/icon.svg", join(outdir, "icon.svg"));

const manifest = JSON.parse(await readFile("src/manifest.json", "utf8"));
if (e2e) {
	manifest.host_permissions.push("http://127.0.0.1/*");
}
await writeFile(
	join(outdir, "manifest.json"),
	`${JSON.stringify(manifest, null, "\t")}\n`,
);

// Dependencies (jszip's setImmediate shim, core-js's globalThis lookup) carry
// Function-constructor fallbacks that never run in Firefox but fail AMO lint
// (MV3 CSP forbids them anyway). Replace them with inert equivalents.
const INERT_REPLACEMENTS: [string, string][] = [
	['Function("return this")()', "globalThis"],
	[
		'e = new Function("" + e)',
		'e = function() { throw new TypeError("not a function"); }',
	],
];

for (const file of await readdir(outdir)) {
	if (!file.endsWith(".js")) continue;
	const path = join(outdir, file);
	let code = await readFile(path, "utf8");
	for (const [from, to] of INERT_REPLACEMENTS) code = code.replaceAll(from, to);
	await writeFile(path, code);
	if (/\beval\(|\bFunction\(/.test(code) || code.includes("process.env")) {
		throw new Error(`${file} contains eval(, Function( or process.env`);
	}
}

console.log(`built ${outdir}/`);
