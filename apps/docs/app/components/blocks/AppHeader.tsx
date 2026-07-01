import * as React from "react";
import { SearchInput } from "../ui/SearchInput";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 bg-base-100 border-b border-base-content/10">
      <div className="flex h-16 items-center px-4 md:px-6 gap-4">
        {/* Logo, Version & Language */}
        <div className="flex items-center gap-4 min-w-fit">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-primary-content shadow-sm">
              R
            </div>
            <a href="/" className="font-semibold text-lg hidden sm:block text-base-content hover:opacity-80 transition-opacity">
              Radiant
            </a>
          </div>

          <div className="hidden md:flex items-center gap-1 ml-2 pl-4 border-l border-base-content/10">
            {/* Version Picker */}
            <div className="dropdown dropdown-hover">
              <div tabIndex={0} role="button" className="btn btn-xs btn-ghost text-base-content/60 font-normal px-2">
                v0.1.0
                <svg className="w-3 h-3 opacity-60 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content z-50 menu p-1.5 shadow-sm bg-base-100 rounded-xl w-32 border border-base-200 mt-1"
              >
                <li>
                  <a className="active text-xs bg-base-200 font-medium text-base-content rounded-lg">v0.1.0</a>
                </li>
              </ul>
            </div>

            {/* Language Picker */}
            <div className="dropdown dropdown-hover">
              <div tabIndex={0} role="button" className="btn btn-xs btn-ghost text-base-content/80 font-medium px-2 gap-1.5">
                <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0H1.125zm17.363 9.75c3.125 0 5.513 2.6 5.513 5.488 0 1.437-.625 2.875-1.75 3.862-1.375 1.125-3.375 1.75-5.5 1.75-1.5 0-3.375-.25-4.875-.75L12 18.875c1.125.375 2.625.625 4.125.625 1.75 0 3.375-.375 4.375-1.125.875-.625 1.25-1.5 1.25-2.5 0-1.875-1.5-3.25-3.75-3.25-1.5 0-3.125.5-4.25 1.25l-.875-2c1.375-1 3.25-1.75 5.5-1.75v-.375zm-9.375 10.75h-2.25v-8.25H2.5v-2.25h8.625v10.5z" />
                </svg>
                ts (Bun)
                <svg className="w-3 h-3 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content z-50 menu p-1.5 shadow-sm bg-base-100 rounded-xl w-48 border border-base-200 mt-1"
              >
                <li className="menu-title px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-base-content/40">
                  Select Runtime
                </li>
                <li>
                  <a className="active bg-base-200 text-sm text-base-content font-medium rounded-lg flex items-center justify-between">
                    <span>ts (Bun)</span>
                    <svg className="w-4 h-4 text-base-content/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </a>
                </li>
                <li>
                  <a className="text-base-content/50 hover:text-base-content/50 cursor-default text-sm rounded-lg flex items-center justify-between mt-1">
                    <span>Go</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-base-content/50 bg-base-200 px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  </a>
                </li>
                <li>
                  <a className="text-base-content/50 hover:text-base-content/50 cursor-default text-sm rounded-lg flex items-center justify-between">
                    <span>Python</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-base-content/50 bg-base-200 px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-xl mx-auto hidden md:block">
          <SearchInput placeholder="Search documentation" />
        </div>

        {/* Nav Links & Auth */}
        <div className="flex items-center gap-6 text-sm font-medium ml-auto">
          <nav className="hidden lg:flex items-center gap-6 text-base-content/70">
            <a href="/" className="hover:text-base-content transition-colors">
              Docs
            </a>
            <a href="/playground" target="_blank" rel="noreferrer" className="hover:text-base-content transition-colors">
              Playground
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
