import React, { useEffect, useState } from "react";
import type { Heading } from "../ui/MarkdownRenderer";

interface OnThisPageProps {
  headings: Heading[];
}

export function OnThisPage({ headings }: OnThisPageProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry closest to the top that is intersecting
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: 0,
      }
    );

    // Observe all heading elements
    for (const heading of headings) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  // Only show h2 and h3 in the TOC for a cleaner list
  const tocHeadings = headings.filter((h) => h.level <= 3);

  return (
    <aside className="hidden xl:block w-56 shrink-0">
      <div className="sticky top-24">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">On This Page</h4>
        <nav className="space-y-1 border-l border-gray-200">
          {tocHeadings.map((heading, index) => {
            const isActive = activeId === heading.id;
            return (
              <a
                key={`${heading.id}-${index}`}
                href={`#${heading.id}`}
                className={`block text-sm leading-snug py-1 border-l-2 -ml-px transition-colors ${
                  isActive
                    ? "border-gray-800 text-gray-900 font-medium pl-3"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300 pl-3"
                } ${heading.level === 3 ? "pl-6" : ""}`}
              >
                {heading.text}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}