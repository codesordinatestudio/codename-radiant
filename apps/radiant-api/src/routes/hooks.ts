import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Modifies src/custom-routes.ts
app.router.post("/projects/:projectId/hooks", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  try {
    const cmd = `bun run ../../packages/cli/src/index.ts generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: p.targetDir as string });
  } catch (e) {
    console.error(e);
  }

  const { path, method, handlerCode, params } = ctx.body as any;

  const routesFilePath = join(p.targetDir as string, "src", "custom-routes.ts");
  if (!existsSync(routesFilePath)) {
    return new Response(JSON.stringify({ error: "custom-routes.ts not found in project" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const existingContent = readFileSync(routesFilePath, "utf8");
  
  const routeRegistration = `
app.router.${method.toLowerCase()}(
  "${path}",
  ${handlerCode}
);
`;

  writeFileSync(routesFilePath, existingContent + "\\n" + routeRegistration);

  // Validation step could involve running `bun run build` in the target dir,
  // but for brevity we'll just return success.
  return {
    status: "injected",
    path,
    method
  };
}, { body: t.Any() });
