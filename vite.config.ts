import { defineConfig, type Plugin } from "vite";
import { renderAbout, renderHead, renderSitemap } from "./src/seo/html";
import { HOME, LANDING_PAGES, type Page, pageForPath } from "./src/seo/pages";

/** Fill index.html's `<!--seo:…-->` placeholders with one page's tags and text. */
function renderPage(html: string, page: Page): string {
  return html
    .replace("<!--seo:head-->", renderHead(page))
    .replace("<!--seo:about-->", renderAbout(page));
}

/**
 * Search pages: index.html is the home page, and each landing page
 * (src/seo/pages.ts) becomes `<slug>.html`, the same app with its own title,
 * description and About text; Vercel serves it at `/<slug>` (cleanUrls).
 * Also writes sitemap.xml.
 */
function seoPages(): Plugin {
  return {
    name: "sol-seo-pages",
    enforce: "post",
    transformIndexHtml: {
      order: "pre",
      handler: (html, context) =>
        // In dev every path falls back to index.html; render the page it stands for.
        renderPage(html, (context.server && pageForPath(context.originalUrl?.split("?")[0] ?? "")) || HOME),
    },
    // After Vite has emitted the finished index.html.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const index = bundle["index.html"];
        if (index?.type !== "asset" || typeof index.source !== "string") {
          this.error("index.html is missing from the bundle; landing pages were not written");
        }
        // The placeholders are already filled with the home page's content.
        const template = index.source
          .replace(renderHead(HOME), "<!--seo:head-->")
          .replace(renderAbout(HOME), "<!--seo:about-->");
        if (!template.includes("<!--seo:head-->") || !template.includes("<!--seo:about-->")) {
          this.error("index.html changed shape: the SEO placeholders could not be recovered");
        }
        for (const page of LANDING_PAGES) {
          this.emitFile({ type: "asset", fileName: `${page.slug}.html`, source: renderPage(template, page) });
        }
        const today = new Date().toISOString().slice(0, 10);
        this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemap(today) });
      },
    },
  };
}

export default defineConfig({
  plugins: [seoPages()],
});
