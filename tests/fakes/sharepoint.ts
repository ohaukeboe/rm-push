import { MINIMAL_PDF } from "./server";

/**
 * Fake SharePoint on the fake origin: the Doc.aspx / doc2.aspx editor page and
 * the v2.0 item conversion (302 to a /transform/pdf URL), as observed on a
 * real OneDrive for Business account.
 */
export function sharepointHandler(req: Request): Response | null {
	const url = new URL(req.url);
	if (/\/_layouts\/15\/doc2?\.aspx$/i.test(url.pathname)) {
		return new Response(
			"<!doctype html><html><head><title>Q4 Plan.docx</title></head><body>word</body></html>",
			{ headers: { "content-type": "text/html" } },
		);
	}
	if (/\/_api\/v2\.0\/drive\/items\/[^/]+\/content$/.test(url.pathname)) {
		if (url.searchParams.get("format") !== "pdf") {
			return new Response('{"error":{"code":"invalidRequest"}}', {
				status: 400,
			});
		}
		return Response.redirect(`${url.origin}/transform/pdf?provider=spo`, 302);
	}
	if (url.pathname === "/transform/pdf") {
		return new Response(MINIMAL_PDF, {
			headers: { "content-type": "application/pdf" },
		});
	}
	return null;
}
