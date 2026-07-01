import { DocTemplate } from "../components/blocks/DocTemplate";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";
import { useLoaderData, useLocation } from "react-router";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function loader({ params }: { params: { runtime: string; slug?: string } }) {
  const runtime = params.runtime;
  const slug = params.slug || "overview";

  // Try content/runtime/ first (runtime docs), then content/core/ (DSL docs)
  const candidates = [
    path.join(process.cwd(), "app/content", runtime, `${slug}.md`),
    path.join(process.cwd(), "app/content/core", `${slug}.md`),
  ];

  let markdown: string;
  for (const filePath of candidates) {
    try {
      markdown = await fs.readFile(filePath, "utf-8");
      // Extract the first H1 as title, and first paragraph as description
      const titleMatch = /^#\s+(.+)$/m.exec(markdown);
      const title = titleMatch ? titleMatch[1] : slug;
      const body = titleMatch
        ? markdown.slice(0, titleMatch.index) + markdown.slice(titleMatch.index + titleMatch[0].length).replace(/^\n+/, "")
        : markdown;
      const descMatch = body
        .split("\n")
        .find((line) => line.trim().length > 0 && !line.startsWith("#") && !line.startsWith("```") && !line.startsWith("|") && !line.startsWith("-"));
      const description = descMatch ? descMatch.replace(/[*_`]/g, "").trim() : undefined;
      return { title, description, body, runtime };
    } catch {
      continue;
    }
  }

  throw new Response("Not Found", { status: 404 });
}

export default function DocPage() {
  const { title, description, body, runtime } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Build prev/next navigation based on known doc order
  const nav = getNav(location.pathname, runtime);

  return (
    <DocTemplate 
      title={title} 
      description={description} 
      prevPage={nav.prev} 
      nextPage={nav.next}
      runtime={runtime}
    >
      <MarkdownRenderer content={body} />
    </DocTemplate>
  );
}

// Documentation navigation order
const DOC_ORDER = [
  "overview",
  "dsl-syntax",
  "config-block",
  "collections",
  "field-types",
  "decorators",
  "globals",
  "access",
  "hooks",
  "custom-endpoints",
  "storage",
  "email",
  "plugins",
  "local-api",
  "rest-api",
  "realtime",
  "queue-manager",
  "cli-reference",
  "editor-support",
  "database-sync",
  "database-plugins",
  "environment-variables",
  "project-structure",
  "deployment",
];

function getNav(currentPath: string, runtime: string): {
  prev?: { label: string; href: string };
  next?: { label: string; href: string };
} {
  const slug = currentPath.replace(new RegExp(`^\\/docs\\/${runtime}\\/`), "").replace(/\/$/, "");
  // If slug is just empty (e.g. /docs/ts), treat as overview
  const actualSlug = slug === "" || slug === `/docs/${runtime}` ? "overview" : slug;
  const idx = DOC_ORDER.indexOf(actualSlug);
  
  if (idx === -1) return {};

  return {
    prev: idx > 0 ? { 
      label: toTitle(DOC_ORDER[idx - 1]), 
      href: `/docs/${runtime}/${DOC_ORDER[idx - 1] === "overview" ? "" : DOC_ORDER[idx - 1]}` 
    } : undefined,
    next: idx < DOC_ORDER.length - 1 ? { 
      label: toTitle(DOC_ORDER[idx + 1]), 
      href: `/docs/${runtime}/${DOC_ORDER[idx + 1]}` 
    } : undefined,
  };
}

function toTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
