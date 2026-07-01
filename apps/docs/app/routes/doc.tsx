import { DocTemplate } from "../components/blocks/DocTemplate";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";
import { useLoaderData, useLocation } from "react-router";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function loader({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const filePath = path.join(process.cwd(), "app/content", `${slug}.md`);

  let markdown: string;
  try {
    markdown = await fs.readFile(filePath, "utf-8");
  } catch {
    throw new Response("Not Found", { status: 404 });
  }

  // Just return the raw markdown to be handled entirely by MarkdownRenderer
  return { title: slug, description: undefined, body: markdown };
}

export default function DocPage() {
  const { title, description, body } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Build prev/next navigation based on known doc order
  const nav = getNav(location.pathname);

  return (
    <DocTemplate
      title={title}
      description={description}
      prevPage={nav.prev}
      nextPage={nav.next}
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
  "cli-reference",
  "code-generation",
  "environment-variables",
  "editor-support",
  "database-sync",
  "project-structure",
  "compiler-pipeline",
];

function getNav(currentPath: string): { prev?: { label: string; href: string }; next?: { label: string; href: string } } {
  const slug = currentPath.replace(/^\/docs\//, "").replace(/\/$/, "");
  const idx = DOC_ORDER.indexOf(slug);
  if (idx === -1) return {};

  return {
    prev: idx > 0 ? { label: toTitle(DOC_ORDER[idx - 1]), href: `/docs/${DOC_ORDER[idx - 1]}` } : undefined,
    next: idx < DOC_ORDER.length - 1 ? { label: toTitle(DOC_ORDER[idx + 1]), href: `/docs/${DOC_ORDER[idx + 1]}` } : undefined,
  };
}

function toTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}