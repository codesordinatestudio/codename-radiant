import React, { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

interface MarkdownRendererProps {
  content: string;
  onHeadingsChange?: (headings: Heading[]) => void;
}

/** Convert heading text to a URL-safe anchor slug. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Extract headings from raw markdown content. */
function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1].length;
      // Strip markdown formatting from heading text
      const text = match[2]
        .replace(/[*_`~](?=\w)/g, "")
        .replace(/(?<=\w)[*_`~]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      headings.push({
        id: slugify(text),
        text,
        level,
      });
    }
  }

  return headings;
}

export function MarkdownRenderer({ content, onHeadingsChange }: MarkdownRendererProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);

  useEffect(() => {
    onHeadingsChange?.(headings);
  }, [headings, onHeadingsChange]);

  return (
    <div className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:scroll-mt-20 prose-a:text-blue-600">
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
          h1: ({ children }: any) => {
            const text = extractText(children);
            return <h1 id={slugify(text)}>{children}</h1>;
          },
          h2: ({ children }: any) => {
            const text = extractText(children);
            return <h2 id={slugify(text)}>{children}</h2>;
          },
          h3: ({ children }: any) => {
            const text = extractText(children);
            return <h3 id={slugify(text)}>{children}</h3>;
          },
          h4: ({ children }: any) => {
            const text = extractText(children);
            return <h4 id={slugify(text)}>{children}</h4>;
          },
          h5: ({ children }: any) => {
            const text = extractText(children);
            return <h5 id={slugify(text)}>{children}</h5>;
          },
          h6: ({ children }: any) => {
            const text = extractText(children);
            return <h6 id={slugify(text)}>{children}</h6>;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

/** Recursively extract plain text from React children (strings, arrays, elements). */
function extractText(children: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children?.props?.children) return extractText(children.props.children);
  return "";
}