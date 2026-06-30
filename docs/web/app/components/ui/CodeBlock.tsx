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
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm my-6 bg-white">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div className="flex gap-4">
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => onTabChange?.(tab)}
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                activeTab === tab 
                  ? "border-gray-800 text-gray-800" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button 
          onClick={handleCopy}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          title="Copy code"
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
      
      {/* Code Area */}
      <div className="bg-[#121212] overflow-x-auto text-[13px] font-mono leading-relaxed [&>div>pre]:!p-5 [&>div>pre]:!m-0 [&>div>pre]:!bg-transparent">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="text-gray-300 p-5 m-0">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
