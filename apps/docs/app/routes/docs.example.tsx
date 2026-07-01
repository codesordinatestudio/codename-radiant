import { DocTemplate } from "../components/blocks/DocTemplate";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";
import { Callout } from "../components/ui/Callout";
import { useLoaderData } from "react-router";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function loader() {
  const filePath = path.join(process.cwd(), "app/content/docs.example.md");
  const markdown = await fs.readFile(filePath, "utf-8");
  return { markdown };
}

export default function DocsExamplePage() {
  const { markdown } = useLoaderData<typeof loader>();

  return (
    <DocTemplate
      title="Installation"
      description="Learn how to install and set up MaterialMe in your project."
      prevPage={{ label: "Intro", href: "#" }}
      nextPage={{ label: "Quickstart", href: "#" }}
    >
      <section>
        <MarkdownRenderer content={markdown} />

        <div className="mt-8">
          <Callout title="Tip" icon={<span className="text-teal-600">💡</span>}>
            You can use <a href="#" className="underline font-medium hover:text-gray-900">Sandpack</a> to develop code preview like this ✌️.
          </Callout>
        </div>
      </section>
    </DocTemplate>
  );
}
