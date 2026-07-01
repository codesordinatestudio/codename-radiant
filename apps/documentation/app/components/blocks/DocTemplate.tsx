import * as React from "react";
import { Icon } from "@iconify/react";
import { useParams, NavLink } from "react-router";
import { AppSidebar } from "./AppSidebar";
import { OnThisPage } from "./OnThisPage";
import { PaginationCard } from "../ui/PaginationCard";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import type { Heading } from "../ui/MarkdownRenderer";

interface DocTemplateProps {
  title?: string;
  description?: React.ReactNode;
  content: string;
  children?: React.ReactNode;
  nextPage?: { label: string; href: string };
  prevPage?: { label: string; href: string };
  runtime: string;
}

export function DocTemplate({ title, description, content, children, nextPage, prevPage, runtime }: DocTemplateProps) {
  const { slug = "overview" } = useParams() as { slug?: string };
  const [headings, setHeadings] = React.useState<Heading[]>([]);
  const articleRef = React.useRef<HTMLElement>(null);

  // Update document meta tags for SEO exactly as requested
  React.useEffect(() => {
    const metaTitle = title ? `${title} - Radiant Documentation` : "Radiant Documentation";
    const metaDesc = typeof description === "string" ? description : "A code-first, config-driven backend engine for Bun + ElysiaJS.";
    
    document.title = metaTitle;

    // Update or create meta description
    let descEl = document.querySelector('meta[name="description"]');
    if (!descEl) {
      descEl = document.createElement("meta");
      descEl.setAttribute("name", "description");
      document.head.appendChild(descEl);
    }
    descEl.setAttribute("content", metaDesc);

    // Update canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `https://docs.radiant.dev/docs/${slug}`);

    // Update og:title
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", metaTitle);

    // Update og:description
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", metaDesc);

    // Update JSON-LD structured data
    let jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      const breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://docs.radiant.dev/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: title || slug,
            item: `https://docs.radiant.dev/docs/${slug}`,
          },
        ],
      };
      jsonLd.textContent = JSON.stringify(breadcrumb);
    }
  }, [slug, title, description]);

  React.useEffect(() => {
    articleRef.current?.scrollTo({ top: 0 });
  }, [slug]);

  return (
    <div className="docs-shell min-h-screen bg-base-100 text-base-content">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-64 bg-linear-to-b from-primary/8 to-transparent"></div>
        <div className="absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-secondary/10 blur-3xl"></div>
        <div className="absolute top-1/3 left-[-6%] h-64 w-64 rounded-full bg-accent/10 blur-3xl"></div>
      </div>

      <header className="sticky top-0 z-40 shrink-0 border-b border-base-content/10 bg-base-100/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <NavLink
              to="/"
              className="text-sm font-bold tracking-[0.3em] text-primary uppercase hover:text-primary/80 transition-colors"
            >
              radiant<span className="text-base-content/20">_docs</span>
            </NavLink>
            <span className="text-base-content/20">/</span>
            <span className="text-base-content/40 text-xs uppercase tracking-wider">{title || slug}</span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-100/70 px-3 py-2 text-[10px] text-base-content/40 tracking-[0.24em] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-success/60 animate-pulse"></span>
              v0.1.0
            </span>

            <div className="dropdown dropdown-hover dropdown-end hidden sm:block">
              <div
                tabIndex={0}
                role="button"
                className="inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-100/70 px-3 py-2 text-[10px] font-medium text-base-content/60 tracking-[0.1em] uppercase hover:bg-base-200 transition-colors"
              >
                <Icon icon="lucide:terminal" className="w-3.5 h-3.5" />
                {runtime === "ts" ? "ts (Bun)" : runtime}
                <Icon icon="lucide:chevron-down" className="w-3.5 h-3.5 opacity-60" />
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content z-50 menu p-1.5 shadow-sm bg-base-100/90 backdrop-blur-md rounded-xl w-48 border border-base-content/10 mt-2"
              >
                <li className="menu-title px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-base-content/40">
                  Select Runtime
                </li>
                <li>
                  <NavLink to={`/docs/ts/${slug}`} className={({isActive}) => isActive || runtime === "ts" ? "active bg-base-200 text-sm text-base-content font-medium rounded-lg flex items-center justify-between" : "text-base-content/70 text-sm rounded-lg flex items-center justify-between hover:bg-base-200"}>
                    <span>ts (Bun)</span>
                    {runtime === "ts" && <Icon icon="lucide:check" className="w-4 h-4 text-base-content/80" />}
                  </NavLink>
                </li>
                <li>
                  <div className="text-base-content/30 cursor-not-allowed text-sm rounded-lg flex items-center justify-between mt-1 hover:bg-transparent pointer-events-none">
                    <span>Go</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-base-content/40 bg-base-content/5 px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  </div>
                </li>
                <li>
                  <div className="text-base-content/30 cursor-not-allowed text-sm rounded-lg flex items-center justify-between mt-1 hover:bg-transparent pointer-events-none">
                    <span>Python</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-base-content/40 bg-base-content/5 px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            <a
              href="/llm.txt"
              className="text-xs text-base-content/45 hover:text-primary transition-colors ml-2"
              target="_blank"
              rel="noreferrer"
            >
              llm.txt
            </a>
            <NavLink to="/" className="text-xs text-base-content/45 hover:text-primary transition-colors ml-2">
              home
            </NavLink>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 xl:grid-cols-5 items-start w-full container mx-auto py-8 h-[calc(100vh-81px)] relative overflow-hidden">
        <aside className="h-full overflow-hidden">
          <AppSidebar runtime={runtime} />
        </aside>

        <article ref={articleRef} className="h-full col-span-3 overflow-auto rounded-4xl px-6 py-8 md:px-10 md:py-10">
          {children}
          <MarkdownRenderer content={content} style={{ padding: 0 }} onHeadingsChange={setHeadings} />

          {(prevPage || nextPage) && (
            <div className="mt-20 pt-8 border-t border-base-content/10">
              <h3 className="text-xl font-bold text-base-content mb-6">Next Steps</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {prevPage ? (
                  <PaginationCard direction="prev" label={prevPage.label} href={prevPage.href} />
                ) : (
                  <div />
                )}
                {nextPage && <PaginationCard direction="next" label={nextPage.label} href={nextPage.href} />}
              </div>
            </div>
          )}
        </article>

        <aside className="hidden xl:block overflow-hidden">
          <OnThisPage headings={headings} />
        </aside>
      </main>
    </div>
  );
}
