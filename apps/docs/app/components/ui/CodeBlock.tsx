import * as React from "react";
import { codeToHtml } from "shiki";

interface CodeBlockProps {
  code: string;
  lang?: string;
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function CodeBlock({ 
  code, 
  lang = "javascript",
  tabs = ["Code"], 
  activeTab = tabs[0],
  onTabChange
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [html, setHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function highlight() {
      try {
        const result = await codeToHtml(code, {
          lang,
          theme: "vitesse-dark",
        });
        setHtml(result);
      } catch (err) {
        console.error("Failed to highlight code:", err);
      }
    }
    highlight();
  }, [code, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mockup-code my-6 shadow-sm relative group bg-[#121212]">
      <button 
        onClick={handleCopy}
        className="absolute top-3 right-3 text-gray-500 hover:text-white transition-opacity p-1 opacity-0 group-hover:opacity-100 z-10 bg-[#121212] rounded-md"
        title="Copy code"
      >
        {copied ? (
          <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
      
      {/* Code Area */}
      <div className="overflow-x-auto text-[13px] font-mono leading-relaxed [&>div>pre]:!p-5 [&>div>pre]:!pt-2 [&>div>pre]:!m-0 [&>div>pre]:!bg-transparent">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre data-prefix=">" className="text-gray-300 p-5 m-0 pt-2">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
