import * as React from "react";
import { Icon } from "@iconify/react";
import { useParams, NavLink } from "react-router";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
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
    const metaDesc =
      typeof description === "string" ? description : "A code-first, config-driven backend engine for Bun + ElysiaJS.";

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
      <AppHeader title={title} runtime={runtime} />

      <main className="grid grid-cols-1 xl:grid-cols-5 items-start w-full container mx-auto py-8 h-[calc(100vh-81px)] relative overflow-hidden">
        <aside className="h-full overflow-hidden">
          <AppSidebar runtime={runtime} />
        </aside>

        <article ref={articleRef} className="h-full col-span-3 overflow-auto rounded-4xl px-6 py-8 md:px-10 md:py-10">
          <div className="mb-10">
            <h1 className="text-4xl font-extrabold tracking-tight text-base-content mb-4">{title}</h1>
          </div>
          {children}
          <MarkdownRenderer content={content} style={{ padding: 0 }} onHeadingsChange={setHeadings} />

          {(prevPage || nextPage) && (
            <div className="mt-20 pt-8 border-t border-base-content/10">
              <h3 className="text-xl font-bold text-base-content mb-6">Next Steps</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {prevPage ? <PaginationCard direction="prev" label={prevPage.label} href={prevPage.href} /> : <div />}
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
