import { MINIMAL_PDF } from "./server";

/**
 * Fake Google Docs: `/document/(u/N/)d/<id>/edit` pages and the PDF export,
 * which answers through a redirect like the real service.
 * Special ids: `forbidden` -> 403, `loggedout` -> 401.
 */
export function googleDocsHandler(req: Request): Response | null {
	const url = new URL(req.url);
	const edit = /^\/document\/(?:u\/\d+\/)?d\/([\w-]+)\/edit$/.exec(
		url.pathname,
	);
	if (edit) {
		return new Response(
			`<!doctype html><html><head><title>${edit[1]} Doc - Google Docs</title></head><body>editor</body></html>`,
			{ headers: { "content-type": "text/html" } },
		);
	}
	const exportMatch = /^\/document\/(?:u\/\d+\/)?d\/([\w-]+)\/export$/.exec(
		url.pathname,
	);
	if (exportMatch && url.searchParams.get("format") === "pdf") {
		const id = exportMatch[1];
		if (id === "forbidden") return new Response("forbidden", { status: 403 });
		if (id === "loggedout") return new Response("login", { status: 401 });
		return Response.redirect(`${url.origin}/googleusercontent/${id}.pdf`, 302);
	}
	if (url.pathname.startsWith("/googleusercontent/")) {
		return new Response(MINIMAL_PDF, {
			headers: { "content-type": "application/pdf" },
		});
	}
	return null;
}
