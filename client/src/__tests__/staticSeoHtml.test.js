import { describe, expect, it } from "vitest";
import { applyStaticSeoHtml, renderSeoHead } from "../utils/staticSeoHtml";

const base = `<html><head>
    <meta charset="UTF-8" />
    <!-- seo-head:start -->
    <meta name="description" content="Home" />
    <title>Home</title>
    <!-- seo-head:end -->
  </head><body><div id="root"></div></body></html>`;

const head = renderSeoHead({
    title: "System Design & <Scaling>",
    description: "Practice \"real\" interviews",
    canonicalUrl: "https://evalcueai.com/system-design",
    ogType: "article",
    siteName: "EvalcueAI",
    structuredData: { "@type": "TechArticle", headline: "</script><script>alert(1)</script>" },
});

describe("static SEO html", () => {
    it("replaces the default SEO block and fills the root", () => {
        const html = applyStaticSeoHtml(base, { head, markup: "<main>Guide</main>" });
        expect(html).not.toContain('content="Home"');
        expect(html.match(/<title>/g)).toHaveLength(1);
        expect(html).toContain("<title>System Design &amp; &lt;Scaling&gt;</title>");
        expect(html).toContain('<meta name="description" content="Practice &quot;real&quot; interviews" />');
        expect(html).toContain('<link rel="canonical" href="https://evalcueai.com/system-design" />');
        expect(html).toContain('<meta property="og:type" content="article" />');
        expect(html).toContain('<meta property="og:image" content="https://evalcueai.com/og-image.png" />');
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
        expect(html).toContain('<meta name="twitter:image" content="https://evalcueai.com/og-image.png" />');
        expect(html).toContain('<div id="root"><main>Guide</main></div>');
        expect(html).toContain('<meta charset="UTF-8" />');
    });

    it("keeps structured data from closing its script element", () => {
        expect(head).not.toContain("</script><script>");
        expect(head).toContain("\\u003c/script>");
    });

    it("fails loudly when index.html lost its markers or root", () => {
        expect(() => applyStaticSeoHtml(base.replace("<!-- seo-head:start -->", ""), { head, markup: "" })).toThrow(/seo-head/);
        expect(() => applyStaticSeoHtml(base.replace('<div id="root"></div>', "<div id=root></div>"), { head, markup: "" })).toThrow(/root/);
    });
});
