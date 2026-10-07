import {
	type Http,
	type HttpResult,
	NetworkError,
} from "../../src/adapters/ports";

/** Http port backed by Bun's fetch, following redirects like the browser adapter. */
export const bunHttp: Http = {
	async fetch(url: string, init?: RequestInit): Promise<HttpResult> {
		let response: Response;
		try {
			response = await fetch(url, { ...init, redirect: "follow" });
		} catch {
			throw new NetworkError(url);
		}
		return {
			status: response.status,
			finalUrl: response.url || url,
			contentType: response.headers.get("content-type") ?? "",
			bytes: new Uint8Array(await response.arrayBuffer()),
		};
	},
};

/** Http port answering from a table of canned results. */
export function cannedHttp(
	table: Record<string, Partial<HttpResult> | "network">,
): Http & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async fetch(url: string): Promise<HttpResult> {
			calls.push(url);
			const entry = table[url];
			if (entry === undefined || entry === "network")
				throw new NetworkError(url);
			return {
				status: 200,
				finalUrl: url,
				contentType: "",
				bytes: new Uint8Array(),
				...entry,
			};
		},
	};
}
