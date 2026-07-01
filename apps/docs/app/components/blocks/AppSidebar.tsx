import * as React from "react";
import { SearchInput } from "../ui/SearchInput";

const NAV_GROUPS: { title: string; items: { label: string; slug: string }[] }[] = [
  {
    title: "Getting Started",
    items: [
      { label: "Overview", slug: "" },
      { label: "DSL Syntax", slug: "dsl-syntax" },
    ],
  },
  {
    title: "Schema",
    items: [
      { label: "Config Block", slug: "config-block" },
      { label: "Collections", slug: "collections" },
      { label: "Field Types", slug: "field-types" },
      { label: "Decorators", slug: "decorators" },
      { label: "Globals", slug: "globals" },
    ],
  },
  {
    title: "Tooling",
    items: [
      { label: "CLI Reference", slug: "cli-reference" },
      { label: "Editor Support", slug: "editor-support" },
      { label: "Database Sync", slug: "database-sync" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "Environment Variables", slug: "environment-variables" },
      { label: "Project Structure", slug: "project-structure" },
    ],
  },
];

export function AppSidebar() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const currentSlug = pathname.replace(/^\/docs\//, "").replace(/\/$/, "");

  return (
    <aside className="w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-gray-200/50 bg-warm-bg sticky top-16 hidden md:block shrink-0">
      <div className="p-4">
        <SearchInput placeholder="Search docs" className="mb-6" />

        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="px-3 text-[13px] font-bold text-gray-900 mb-1 tracking-wide uppercase">
                {group.title}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const href = item.slug === "" ? "/" : `/docs/${item.slug}`;
                  const isActive = currentSlug === item.slug || (item.slug === "" && pathname === "/");
                  return (
                    <a
                      key={item.slug}
                      href={href}
                      className={`flex items-center px-3 py-1 ml-1 rounded-lg text-[13px] transition-colors ${
                        isActive
                          ? "bg-gray-200/50 text-gray-900 font-medium"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}