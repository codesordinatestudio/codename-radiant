import * as React from "react";
import { SearchInput } from "../ui/SearchInput";
import { Link, useLocation } from "react-router";

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
    title: "TS Runtime",
    items: [
      { label: "Access Control", slug: "access" },
      { label: "Hooks", slug: "hooks" },
      { label: "Custom Endpoints", slug: "custom-endpoints" },
      { label: "Storage", slug: "storage" },
      { label: "Email", slug: "email" },
      { label: "Plugins", slug: "plugins" },
    ],
  },
  {
    title: "Data",
    items: [
      { label: "Local API", slug: "local-api" },
      { label: "REST API", slug: "rest-api" },
    ],
  },
  {
    title: "Utils",
    items: [
      { label: "Realtime", slug: "realtime" },
      { label: "Queue Manager", slug: "queue-manager" },
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
    title: "Plugins",
    items: [{ label: "Database Plugins", slug: "database-plugins" }],
  },
  {
    title: "Reference",
    items: [
      { label: "Environment Variables", slug: "environment-variables" },
      { label: "Project Structure", slug: "project-structure" },
    ],
  },
  {
    title: "Production",
    items: [{ label: "Deployment", slug: "deployment" }],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const pathname = location.pathname;
  const currentSlug = pathname.replace(/^\/docs\//, "").replace(/\/$/, "");

  return (
    <aside className="w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-base-content/10 bg-base-100 sticky top-16 hidden md:block shrink-0">
      <div className="p-4">
        <SearchInput placeholder="Search docs" className="mb-6" />

        <ul className="menu w-full p-0">
          {NAV_GROUPS.map((group) => {
            const hasActiveItem = group.items.some(
              (item) => currentSlug === item.slug || (item.slug === "" && pathname === "/"),
            );

            return (
              <li key={group.title} className="mb-1">
                <details open={hasActiveItem || group.title === "Getting Started"}>
                  <summary className="font-semibold text-sm text-base-content capitalize tracking-wider py-2 hover:bg-base-200">
                    {group.title}
                  </summary>
                  <ul className="ml-2 pl-4 border-l border-base-content/10 mt-1 mb-2 space-y-0.5">
                    {group.items.map((item) => {
                      const href = item.slug === "" ? "/" : `/docs/${item.slug}`;
                      const isActive = currentSlug === item.slug || (item.slug === "" && pathname === "/");
                      return (
                        <li key={item.slug}>
                          <Link
                            to={href}
                            className={`text-sm py-1.5 transition-colors ${
                              isActive
                                ? "bg-base-200 text-base-content font-medium active:bg-base-200! active:text-base-content!"
                                : "text-base-content/70 hover:text-base-content hover:bg-base-200"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
