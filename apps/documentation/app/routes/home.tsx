import { DocTemplate } from "../components/blocks/DocTemplate";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";
import { Callout } from "../components/ui/Callout";
import { useLoaderData, Link } from "react-router";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function loader() {
  const filePath = path.join(process.cwd(), "app/content/core", "overview.md");
  const markdown = await fs.readFile(filePath, "utf-8");

  console.log(filePath);

  const titleMatch = /^#\s+(.+)$/m.exec(markdown);
  const title = titleMatch ? titleMatch[1] : "Overview";
  const body = titleMatch
    ? markdown.slice(0, titleMatch.index) + markdown.slice(titleMatch.index + titleMatch[0].length).replace(/^\n+/, "")
    : markdown;

  const descMatch = body
    .split("\n")
    .find(
      (line) =>
        line.trim().length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith("```") &&
        !line.startsWith("|") &&
        !line.startsWith("-"),
    );

  const description = descMatch ? descMatch.replace(/[*_`]/g, "").trim() : undefined;

  return { title, description, body };
}

export default function Home() {
  const { title, description, body } = useLoaderData<typeof loader>();

  return (
    <DocTemplate
      title={title}
      description={description}
      content={body}
      nextPage={{ label: "DSL Syntax", href: "/docs/ts/dsl-syntax" }}
      runtime="ts"
    >
      <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
        <Link to="/docs/ts/" className="btn btn-primary text-primary-content border-none px-8">
          Go to Documentation
        </Link>
      </div>
    </DocTemplate>
  );
}
