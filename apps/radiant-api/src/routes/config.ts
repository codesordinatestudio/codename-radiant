import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Modifies config.radiant
app.router.patch("/projects/:projectId/config", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  const data = ctx.body as any;

  const configFilePath = join(p.targetDir as string, "radiant", "config.radiant");
  if (!existsSync(configFilePath)) {
    return new Response(JSON.stringify({ error: "config.radiant not found in project" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const existingContent = readFileSync(configFilePath, "utf8");
  let newContent = existingContent;

  // Simple string replacement for config fields.
  // Note: a robust implementation would use a CST (Chevrotain).
  for (const [key, value] of Object.entries(data)) {
    const fieldRegex = new RegExp(`(${key}\\s*:\\s*)([^;]+)(;)`, "g");
    if (fieldRegex.test(newContent)) {
      newContent = newContent.replace(fieldRegex, `$1${typeof value === "string" ? '"' + value + '"' : value}$3`);
    } else {
      // If field doesn't exist, append it inside config block.
      // E.g., `config { ... }`
      const configBlockRegex = /config\s*\{([\s\S]*?)\}/;
      if (configBlockRegex.test(newContent)) {
        newContent = newContent.replace(
          configBlockRegex,
          `config {$1  ${key}: ${typeof value === "string" ? '"' + value + '"' : value};\n}`
        );
      }
    }
  }

  writeFileSync(configFilePath, newContent);

  try {
    const cmd = `bun run ../../packages/cli/src/index.ts generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: p.targetDir as string });

    return {
      status: "compiled",
      updatedFields: Object.keys(data)
    };
  } catch (error: any) {
    writeFileSync(configFilePath, existingContent);
    return new Response(JSON.stringify({ error: "Validation failed, changes rolled back", details: error.message }), { status: 400, headers: { "Content-Type": "application/json" }});
  }
}, { body: t.Any() });
