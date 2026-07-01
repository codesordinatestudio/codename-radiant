import { useEffect, useRef } from "react";
import MarkdownPreview from "@uiw/react-markdown-preview";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

interface MarkdownRendererProps {
  content: string;
  onHeadingsChange?: (headings: Heading[]) => void;
  style?: React.CSSProperties;
}

export function MarkdownRenderer({ content, onHeadingsChange, style }: MarkdownRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onHeadingsChange) return;

    // Small delay to ensure the Markdown DOM is fully painted with IDs
    const timer = setTimeout(() => {
      const headingElements = wrapperRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6");
      if (!headingElements) return;

      const extractedHeadings: Heading[] = [];
      headingElements.forEach((el) => {
        extractedHeadings.push({
          id: el.id, // @uiw/react-markdown-preview handles generating proper IDs natively
          text: el.textContent || "",
          level: parseInt(el.tagName.charAt(1)),
        });
      });

      onHeadingsChange(extractedHeadings);
    }, 50);

    return () => clearTimeout(timer);
  }, [content, onHeadingsChange]);

  return (
    <div ref={wrapperRef} className="w-full">
      <MarkdownPreview
        source={content}
        style={{
          ...style,
          fontFamily: "inherit",
          backgroundColor: "transparent",
        }}
      />
    </div>
  );
}
