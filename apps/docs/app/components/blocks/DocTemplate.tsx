import * as React from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { OnThisPage } from "./OnThisPage";
import { PaginationCard } from "../ui/PaginationCard";
import type { Heading } from "../ui/MarkdownRenderer";

interface DocTemplateProps {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  nextPage?: { label: string; href: string };
  prevPage?: { label: string; href: string };
}

export function DocTemplate({
  title,
  description,
  children,
  nextPage,
  prevPage,
}: DocTemplateProps) {
  const [headings, setHeadings] = React.useState<Heading[]>([]);

  return (
    <div className="min-h-screen bg-warm-bg text-text-main flex flex-col font-sans">
      <AppHeader />
      <div className="flex flex-1 max-w-[1440px] mx-auto w-full">
        <AppSidebar />
        <div className="flex flex-1 justify-between">
          <main className="flex-1 px-6 py-12 md:px-12 lg:px-24 max-w-4xl min-w-0">
            <article className="prose prose-slate max-w-none">
              {/* Main Content Area */}
              <div className="mt-8 space-y-12">
                {React.cloneElement(children as React.ReactElement<any>, {
                  onHeadingsChange: setHeadings,
                })}
              </div>

              {/* Pagination Footer */}
              {(prevPage || nextPage) && (
                <div className="mt-20 pt-8 border-t border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Next Steps</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {prevPage ? (
                      <PaginationCard direction="prev" label={prevPage.label} href={prevPage.href} />
                    ) : <div />}
                    {nextPage && (
                      <PaginationCard direction="next" label={nextPage.label} href={nextPage.href} />
                    )}
                  </div>
                </div>
              )}
            </article>
          </main>
          <OnThisPage headings={headings} />
        </div>
      </div>
    </div>
  );
}