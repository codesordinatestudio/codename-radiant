import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function generateConfigDsl(data: any) {
  let lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null) {
      let subLines = [];
      for (const [subKey, subValue] of Object.entries(value)) {
        if (typeof subValue === "string") subLines.push(`    ${subKey}: "${subValue}";`);
        else subLines.push(`    ${subKey}: ${subValue};`);
      }
      lines.push(`  ${key}: {\n${subLines.join("\n")}\n  }`);
    } else {
      if (typeof value === "string") lines.push(`  ${key}: "${value}";`);
      else lines.push(`  ${key}: ${value};`);
    }
  }
  return `config {\n${lines.join("\n")}\n}\n`;
}

// PUT config
app.router.put("/projects/:projectId/config", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  }

  const p = project.docs[0];
  const data = ctx.body as any;

  const configFilePath = join(p.targetDir as string, "radiant", "config.radiant");
  const existingContent = existsSync(configFilePath) ? readFileSync(configFilePath, "utf8") : null;

  const newDsl = generateConfigDsl(data);
  writeFileSync(configFilePath, newDsl);

  try {
    const cmd = `bun run ../../packages/cli/src/index.ts generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: p.targetDir as string });

    return {
      status: "compiled",
      dsl: newDsl
    };
  } catch (error: any) {
    if (existingContent === null) {
      import("fs").then(fs => fs.rmSync(configFilePath, { force: true }));
    } else {
      writeFileSync(configFilePath, existingContent);
    }
    return new Response(JSON.stringify({ error: "Validation failed, changes rolled back", details: error.message }), { status: 400 });
  }
}, { body: t.Any() });

