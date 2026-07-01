import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            
            // If it is a standalone code block (not inline)
            if (!inline && match) {
              return (
                <CodeBlock
                  code={String(children).replace(/\n$/, "")}
                  lang={match[1]}
                />
              );
            }
            
            // Otherwise, render as inline code snippet
            return (
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm text-gray-800" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
