import type { Config } from "./config";

declare global {
	/** Replaced at build time by build.ts; undefined under `bun test`. */
	const __CONFIG__: Partial<Config> | undefined;
}
