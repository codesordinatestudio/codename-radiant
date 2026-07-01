import * as React from "react";
import { NavLink, useParams } from "react-router";
import { Icon } from "@iconify/react";

interface AppHeaderProps {
  title?: string;
  runtime: string;
}

export function AppHeader({ title, runtime }: AppHeaderProps) {
  const { slug = "overview" } = useParams() as { slug?: string };

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-base-content/10 bg-base-100 backdrop-blur-xl">
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
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-200 px-3 py-2 text-[10px] text-base-content/40 tracking-[0.24em] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-success/60 animate-pulse"></span>
            v0.1.0
          </span>

          <div className="dropdown dropdown-hover dropdown-end hidden sm:block">
            <div
              tabIndex={0}
              role="button"
              className="inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-300 px-3 py-2 text-[10px] font-medium text-base-content/60 tracking-widest uppercase hover:bg-base-200 transition-colors"
            >
              <Icon icon="lucide:terminal" className="w-3.5 h-3.5" />
              {runtime === "ts" ? "ts (Bun)" : runtime}
              <Icon icon="lucide:chevron-down" className="w-3.5 h-3.5 opacity-60" />
            </div>

            <ul
              tabIndex={0}
              className="dropdown-content z-50 menu p-1.5 shadow-sm bg-base-300 backdrop-blur-md rounded-xl w-48 border border-base-content/10"
            >
              <li className="menu-title px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-base-content/40">
                Select Runtime
              </li>
              <li>
                <NavLink
                  to={`/docs/ts/${slug}`}
                  className={({ isActive }) =>
                    isActive || runtime === "ts"
                      ? "active bg-base-200 text-sm text-base-content font-medium rounded-lg flex items-center justify-between"
                      : "text-base-content/70 text-sm rounded-lg flex items-center justify-between hover:bg-base-200"
                  }
                >
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
        </div>
      </div>
    </header>
  );
}
