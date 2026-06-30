import * as React from "react";
import { SearchInput } from "../ui/SearchInput";

export function AppSidebar() {
  return (
    <aside className="w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-gray-200/50 bg-warm-bg sticky top-16 hidden md:block shrink-0">
      <div className="p-4">
        <SearchInput placeholder="Fast search" className="mb-6" />

        <nav className="space-y-6">
          {/* Main Sections */}
          <div className="space-y-1">
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-200/50 text-gray-900 font-medium">
              📄 Documentation
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              🗺️ Roadmap
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              📑 Templates
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              👥 Community
            </a>
          </div>

          {/* Intro Group */}
          <div>
            <h3 className="px-3 text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-gray-400 text-xs">▶</span> Intro
            </h3>
          </div>

          {/* Getting Started Group */}
          <div>
            <h3 className="px-3 text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-gray-400 text-xs">▼</span> Getting started
            </h3>
            <div className="space-y-1">
              <a href="#" className="flex items-center justify-between px-3 py-1.5 ml-4 rounded-lg bg-gray-200/50 text-gray-900 text-sm">
                Install
                <span className="text-[10px] uppercase font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">React</span>
              </a>
              <a href="#" className="flex items-center px-3 py-1.5 ml-4 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Quickstart
              </a>
            </div>
          </div>

          {/* Usage Group */}
          <div>
            <h3 className="px-3 text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-gray-400 text-xs">▼</span> Usage
            </h3>
            <div className="space-y-1">
              <a href="#" className="flex items-center px-3 py-1.5 ml-4 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Layout
              </a>
              <a href="#" className="flex items-center px-3 py-1.5 ml-4 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Themes
              </a>
              <a href="#" className="flex items-center px-3 py-1.5 ml-4 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Private packages
              </a>
            </div>
          </div>
          
          {/* Advanced Usage Group */}
          <div>
            <h3 className="px-3 text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-gray-400 text-xs">▼</span> Advanced Usage
            </h3>
            <div className="space-y-1">
              <a href="#" className="flex items-center px-3 py-1.5 ml-4 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Overview
              </a>
              <a href="#" className="flex items-center px-3 py-1.5 ml-4 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors text-sm">
                Components
              </a>
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
}
