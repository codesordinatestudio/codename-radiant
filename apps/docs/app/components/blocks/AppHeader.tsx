import * as React from "react";
import { SearchInput } from "../ui/SearchInput";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 bg-warm-surface border-b border-gray-200/50">
      <div className="flex h-16 items-center px-4 md:px-6 gap-4">
        {/* Logo & Version */}
        <div className="flex items-center gap-3 min-w-fit">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-white shadow-sm">
            R
          </div>
          <a href="/" className="font-semibold text-lg hidden sm:block hover:text-gray-700 transition-colors">
            Radiant
          </a>
          <select className="bg-transparent text-sm text-gray-500 border-none outline-none cursor-pointer hidden md:block">
            <option>v0.1.0</option>
          </select>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-xl mx-auto hidden md:block">
          <SearchInput placeholder="Search documentation" />
        </div>

        {/* Nav Links & Auth */}
        <div className="flex items-center gap-6 text-sm font-medium ml-auto">
          <nav className="hidden lg:flex items-center gap-6 text-gray-600">
            <a href="/" className="hover:text-gray-900 transition-colors">Docs</a>
            <a href="https://github.com/codesordinatestudio/radiant" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors">GitHub</a>
          </nav>

          <div className="flex items-center gap-3">
            <a href="https://github.com/codesordinatestudio/radiant" target="_blank" rel="noreferrer" className="hidden sm:block text-gray-600 hover:text-gray-900 transition-colors">Sign In</a>
            <a href="/docs/overview" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-full transition-colors">
              Get Started
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}