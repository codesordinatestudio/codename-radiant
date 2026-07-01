import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync, readdirSync } from "fs";
import { join } from "path";

async function getProjectDir(projectId: string) {
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  if (project.docs.length === 0) return null;
  return project.docs[0].targetDir as string;
}

function updateBarrelFile(accessDir: string) {
  const files = readdirSync(accessDir).filter(f => f.endsWith(".ts") && f !== "index.ts");
  let barrelContent = `// Auto-generated barrel file\n`;
  for (const file of files) {
    const name = file.replace(".ts", "");
    barrelContent += `import "./${name}";\n`;
  }
  writeFileSync(join(accessDir, "index.ts"), barrelContent);
}

function ensureAccessDir(targetDir: string) {
  const accessPath = join(targetDir, "src", "access");
  const oldAccessFile = join(targetDir, "src", "access.ts");
  
  if (existsSync(oldAccessFile) && statSync(oldAccessFile).isFile()) {
    rmSync(oldAccessFile);
  }
  
  if (!existsSync(accessPath)) {
    mkdirSync(accessPath, { recursive: true });
    writeFileSync(join(accessPath, "index.ts"), "// Auto-generated barrel file\n");
  }
  
  return accessPath;
}

function generateAccessCode(collection: string, rules: Record<string, string>) {
  let rulesObj = Object.entries(rules).map(([op, code]) => `${op}: ${code}`).join(",\n  ");
  return `import { app } from "../app";\n\napp.access("${collection}", {\n  ${rulesObj}\n});\n`;
}

// POST / PUT helper
async function saveAccess(projectId: string, collection: string, rules: Record<string, string>, isUpdate: boolean) {
  const targetDir = await getProjectDir(projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const accessDir = ensureAccessDir(targetDir);
  const filePath = join(accessDir, `${collection}.ts`);

  if (!isUpdate && existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Access rule already exists" }), { status: 409 });
  }
  if (isUpdate && !existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Access rule not found" }), { status: 404 });
  }

  const code = generateAccessCode(collection, rules);
  writeFileSync(filePath, code);
  updateBarrelFile(accessDir);

  return { collection, status: "saved", code };
}

// POST
app.router.post("/projects/:projectId/access", async (ctx) => {
  const { collection, rules } = ctx.body as any;
  return saveAccess(ctx.params.projectId, collection, rules, false);
}, { body: t.Any() });

// PUT
app.router.put("/projects/:projectId/access/:collection", async (ctx) => {
  const { rules } = ctx.body as any;
  return saveAccess(ctx.params.projectId, ctx.params.collection, rules, true);
}, { body: t.Any() });

// DELETE
app.router.delete("/projects/:projectId/access/:collection", async (ctx) => {
  const targetDir = await getProjectDir(ctx.params.projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const accessDir = ensureAccessDir(targetDir);
  const filePath = join(accessDir, `${ctx.params.collection}.ts`);

  if (!existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Access rule not found" }), { status: 404 });
  }

  rmSync(filePath);
  updateBarrelFile(accessDir);

  return { collection: ctx.params.collection, status: "removed" };
});
