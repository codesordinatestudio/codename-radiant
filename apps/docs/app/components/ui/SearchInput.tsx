import * as React from "react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function SearchInput({ className = "", ...props }: SearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <svg 
        className="absolute left-3 w-4 h-4 text-gray-400" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input 
        type="text" 
        className="w-full bg-warm-bg border border-gray-200 rounded-full py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 transition-shadow"
        {...props}
      />
    </div>
  );
}
