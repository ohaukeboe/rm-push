import { type Http, type HttpResult, NetworkError } from "../ports";

/** Background fetch with the user's (default-container) cookies. */
export const browserHttp: Http = {
	async fetch(url: string, init?: RequestInit): Promise<HttpResult> {
		let response: Response;
		try {
			response = await fetch(url, {
				credentials: "include",
				redirect: "follow",
				...init,
			});
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
