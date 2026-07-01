import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Modifies src/access.ts
app.router.post("/projects/:projectId/access", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  const { collection, rules } = ctx.body as any;

  const accessFilePath = join(p.targetDir as string, "src", "access.ts");
  if (!existsSync(accessFilePath)) {
    return new Response(JSON.stringify({ error: "access.ts not found in project" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const existingContent = readFileSync(accessFilePath, "utf8");
  
  let rulesObj = Object.entries(rules).map(([op, code]) => `${op}: ${code}`).join(",\\n  ");
  const accessRegistration = `
app.access("${collection}", {
  ${rulesObj}
});
`;

  writeFileSync(accessFilePath, existingContent + "\\n" + accessRegistration);

  return {
    status: "injected",
    collection
  };
}, { body: t.Any() });
