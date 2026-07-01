import * as React from "react";

interface PaginationCardProps {
  direction: "prev" | "next";
  label: string;
  href: string;
}

export function PaginationCard({ direction, label, href }: PaginationCardProps) {
  return (
    <a 
      href={href}
      className={`flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all bg-white ${direction === "prev" ? "justify-start" : "justify-between"}`}
    >
      {direction === "prev" && <span className="text-gray-400">←</span>}
      <span className="font-medium text-gray-800">{label}</span>
      {direction === "next" && <span className="text-gray-400">→</span>}
    </a>
  );
}
