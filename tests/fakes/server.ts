/**
 * One local HTTP server for all fakes, so a single origin can stand in for
 * reMarkable, Google Docs, SharePoint and fixture pages (unit, integration and E2E).
 */
import { RemarkableFake } from "./remarkable";

export type Handler = (
	req: Request,
) => Promise<Response | null> | Response | null;

export interface FakeServer {
	url: string;
	remarkable: RemarkableFake;
	/** Static responses by path, e.g. fixture PDFs and pages. */
	fixtures: Map<string, () => Response>;
	/** Extra handlers tried after reMarkable and fixtures. */
	handlers: Handler[];
	/** Every request path seen, in order. */
	requests: string[];
	stop(): Promise<void>;
}

export function startFakeServer(port = 0): FakeServer {
	const remarkable = new RemarkableFake();
	const fixtures = new Map<string, () => Response>();
	const handlers: Handler[] = [];
	const requests: string[] = [];

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			requests.push(`${req.method} ${url.pathname}${url.search}`);
			const fromRemarkable = await remarkable.handle(req);
			if (fromRemarkable) return fromRemarkable;
			const fixture = fixtures.get(url.pathname);
			if (fixture) return fixture();
			for (const handler of handlers) {
				const response = await handler(req);
				if (response) return response;
			}
			return new Response("not found", { status: 404 });
		},
	});

	return {
		url: `http://127.0.0.1:${server.port}`,
		remarkable,
		fixtures,
		handlers,
		requests,
		async stop() {
			await server.stop(true);
		},
	};
}

/** A minimal valid one-page PDF. */
export const MINIMAL_PDF = new TextEncoder().encode(
	"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
