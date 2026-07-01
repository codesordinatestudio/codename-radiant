import * as React from "react";
import { Icon } from "@iconify/react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function SearchInput({ className = "", ...props }: SearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Icon 
        icon="lucide:search"
        className="absolute left-3 w-4 h-4 text-base-content/50" 
      />
      <input 
        type="text" 
        className="w-full bg-base-100 border border-base-content/10 rounded-full py-1.5 pl-9 pr-4 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:border-base-content/30 focus:ring-1 focus:ring-base-content/30 transition-shadow"
        {...props}
      />
    </div>
  );
}
