import { MINIMAL_PDF } from "./server";

/**
 * Fake SharePoint on the fake origin: the Doc.aspx editor page, the
 * GetFileById lookup and the v2.0 PDF conversion (302 to a /transform/pdf URL).
 */
export function sharepointHandler(req: Request): Response | null {
	const url = new URL(req.url);
	if (/\/_layouts\/15\/Doc\.aspx$/i.test(url.pathname)) {
		return new Response(
			"<!doctype html><html><head><title>Q4 Plan.docx</title></head><body>word</body></html>",
			{ headers: { "content-type": "text/html" } },
		);
	}
	const lookup = /^(.*)\/_api\/web\/GetFileById\('([^']+)'\)$/.exec(
		decodeURIComponent(url.pathname),
	);
	if (lookup) {
		return Response.json({
			ServerRelativeUrl: `${lookup[1]}/Shared Documents/Plans/Q4 Plan.docx`,
		});
	}
	if (
		url.pathname.startsWith("/_api/v2.0/sites/") &&
		url.pathname.endsWith(":/content")
	) {
		if (url.searchParams.get("format") !== "PDF")
			return new Response("bad", { status: 400 });
		return Response.redirect(`${url.origin}/transform/pdf?provider=spo`, 302);
	}
	if (url.pathname === "/transform/pdf") {
		return new Response(MINIMAL_PDF, {
			headers: { "content-type": "application/pdf" },
		});
	}
	return null;
}
