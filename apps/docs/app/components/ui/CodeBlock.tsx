import * as React from "react";
import { codeToHtml } from "shiki";

interface CodeBlockProps {
  code: string;
  lang?: string;
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function CodeBlock({ code, lang = "javascript" }: CodeBlockProps) {
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

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm my-6 bg-[#121212]">
      <div className="overflow-x-auto text-[13px] font-mono leading-relaxed [&>div>pre]:!p-5 [&>div>pre]:!m-0 [&>div>pre]:!bg-transparent">
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
