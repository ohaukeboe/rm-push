import { describe, expect, test } from "bun:test";
import { sanitizeArticleHtml } from "../../src/core/epub";

const base = "https://example.com/blog/post.html";

describe("sanitizeArticleHtml", () => {
	test("removes active and interactive elements", () => {
		const { html } = sanitizeArticleHtml(
			`<p>keep</p><script>x()</script><style>p{}</style><iframe src="a"></iframe>
			<form><input name="q"><button>go</button></form><noscript>n</noscript>
			<object data="x"></object><embed src="y"><svg><circle/></svg>`,
			base,
		);
		expect(html).toContain("<p>keep</p>");
		for (const tag of [
			"script",
			"style",
			"iframe",
			"form",
			"input",
			"button",
			"noscript",
			"object",
			"embed",
			"svg",
		]) {
			expect(html).not.toContain(`<${tag}`);
		}
	});

	test("removes event handlers, srcset, sizes and style attributes", () => {
		const { html } = sanitizeArticleHtml(
			`<p onclick="evil()" style="color:red" class="c">t</p><img src="a.png" srcset="b.png 2x" sizes="10px" onerror="x">`,
			base,
		);
		expect(html).not.toMatch(/onclick|onerror|srcset|sizes|style=/);
		expect(html).toContain('class="c"');
	});

	test("drops attributes that are not valid XML names", () => {
		const doc = sanitizeArticleHtml('<p data-ok="1">x</p>', base);
		expect(doc.html).toContain('data-ok="1"');
		const { html } = sanitizeArticleHtml('<p a:b="1" 1x="2">x</p>', base);
		expect(html).not.toContain("a:b");
		expect(html).not.toContain("1x=");
	});

	test("strips control characters from text", () => {
		const { html } = sanitizeArticleHtml("<p>a\u0001b\u0008c\td</p>", base);
		expect(html).toContain("<p>abc\td</p>");
	});

	test("resolves relative links and images against the base URL", () => {
		const { html, imageUrls } = sanitizeArticleHtml(
			'<a href="../other.html">o</a><img src="img/a.png"><img src="//cdn.example.com/b.jpg">',
			base,
		);
		expect(html).toContain('href="https://example.com/other.html"');
		expect(imageUrls).toEqual([
			"https://example.com/blog/img/a.png",
			"https://cdn.example.com/b.jpg",
		]);
		expect(html).toContain('src="https://example.com/blog/img/a.png"');
	});

	test("lists each image once in document order, skipping unusable sources", () => {
		const { imageUrls, html } = sanitizeArticleHtml(
			'<img src="a.png"><img src="javascript:x"><img src="a.png"><img><img src="data:image/png;base64,AA==">',
			base,
		);
		expect(imageUrls).toEqual([
			"https://example.com/blog/a.png",
			"data:image/png;base64,AA==",
		]);
		expect(html).not.toContain("javascript:");
	});

	test("drops javascript: links but keeps their text", () => {
		const { html } = sanitizeArticleHtml(
			'<a href="javascript:alert(1)">txt</a>',
			base,
		);
		expect(html).not.toContain("javascript:");
		expect(html).toContain("txt");
	});
});
