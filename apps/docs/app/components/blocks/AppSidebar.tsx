import { Link, useLocation } from "react-router";
import * as React from "react";

const CORE_NAV_GROUPS = [
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
];

const TS_NAV_GROUPS = [
  {
    title: "Runtime",
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

export function AppSidebar({ runtime }: { runtime: string }) {
  const location = useLocation();
  const pathname = location.pathname;
  
  // E.g., /docs/ts/access -> slug is 'access'. /docs/ts -> slug is ''
  const currentSlug = pathname.replace(new RegExp(`^\\/docs\\/${runtime}\\/`), "").replace(/\/$/, "");
  const activeSlug = currentSlug === "" || currentSlug === `/docs/${runtime}` ? "" : currentSlug;

  const NAV_GROUPS = runtime === "ts" ? [...CORE_NAV_GROUPS, ...TS_NAV_GROUPS] : CORE_NAV_GROUPS;

  return (
    <aside className="w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-base-content/10 bg-base-100 sticky top-16 hidden md:block shrink-0">
      <div className="p-4 pt-6">

        <ul className="menu w-full p-0">
          {NAV_GROUPS.map((group) => {
            const hasActiveItem = group.items.some(
              (item) => activeSlug === item.slug || (item.slug === "" && activeSlug === ""),
            );

            return (
              <li key={group.title} className="mb-1">
                <details open={hasActiveItem || group.title === "Getting Started"}>
                  <summary className="font-semibold text-sm text-base-content capitalize tracking-wider py-2 hover:bg-base-200">
                    {group.title}
                  </summary>
                  <ul className="ml-2 pl-4 border-l border-base-content/10 mt-1 mb-2 space-y-0.5">
                    {group.items.map((item) => {
                      const href = item.slug === "" ? `/docs/${runtime}` : `/docs/${runtime}/${item.slug}`;
                      const isActive = activeSlug === item.slug || (item.slug === "" && activeSlug === "");
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
