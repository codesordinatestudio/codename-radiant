import * as React from "react";

interface CalloutProps {
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function Callout({ title, children, icon }: CalloutProps) {
  return (
    <div className="bg-callout-bg text-callout-text p-4 rounded-r-xl rounded-l border-l-4 border-callout-text flex items-start gap-3 my-6">
      <div className="mt-0.5 text-xl">
        {icon || "💡"}
      </div>
      <div>
        {title && <h4 className="font-semibold mb-1">{title}</h4>}
        <div className="text-sm opacity-90 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
