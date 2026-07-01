import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync, readdirSync } from "fs";
import { join } from "path"
async function getProjectDir(projectId: string) {
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  if (project.docs.length === 0) return null;
  return project.docs[0].targetDir as string;
}

function updateBarrelFile(hooksDir: string) {
  const files = readdirSync(hooksDir).filter(f => f.endsWith(".ts") && f !== "index.ts");
  let barrelContent = `// Auto-generated barrel file\n`;
  for (const file of files) {
    const name = file.replace(".ts", "");
    barrelContent += `import "./${name}";\n`;
  }
  writeFileSync(join(hooksDir, "index.ts"), barrelContent);
}

function ensureHooksDir(targetDir: string) {
  const hooksPath = join(targetDir, "src", "hooks");
  
  if (!existsSync(hooksPath)) {
    mkdirSync(hooksPath, { recursive: true });
    writeFileSync(join(hooksPath, "index.ts"), "// Auto-generated barrel file\n");
  }
  
  // Also ensure src/index.ts imports the hooks barrel
  const indexPath = join(targetDir, "src", "index.ts");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf8");
    if (!indexContent.includes('import "./hooks";')) {
      writeFileSync(indexPath, `import "./hooks";\n${indexContent}`);
    }
  }

  return hooksPath;
}

function generateHookCode(code: string) {
  return `import { app } from "../app";\n\n${code}\n`;
}

// POST / PUT helper
async function saveHook(projectId: string, slug: string, code: string, isUpdate: boolean) {
  const targetDir = await getProjectDir(projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const hooksDir = ensureHooksDir(targetDir);
  const filePath = join(hooksDir, `${slug}.ts`);

  if (!isUpdate && existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Hook already exists" }), { status: 409 });
  }
  if (isUpdate && !existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Hook not found" }), { status: 404 });
  }

  const fileCode = generateHookCode(code);
  writeFileSync(filePath, fileCode);
  updateBarrelFile(hooksDir);

  return { slug, status: "saved", code };
}

// POST
app.router.post("/projects/:projectId/hooks", async (ctx) => {
  const { slug, code } = ctx.body as any;
  return saveHook(ctx.params.projectId, slug, code, false);
}, { body: t.Any() });

// PUT
app.router.put("/projects/:projectId/hooks/:slug", async (ctx) => {
  const { code } = ctx.body as any;
  return saveHook(ctx.params.projectId, ctx.params.slug, code, true);
}, { body: t.Any() });

// DELETE
app.router.delete("/projects/:projectId/hooks/:slug", async (ctx) => {
  const targetDir = await getProjectDir(ctx.params.projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const hooksDir = ensureHooksDir(targetDir);
  const filePath = join(hooksDir, `${ctx.params.slug}.ts`);

  if (!existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Hook not found" }), { status: 404 });
  }

  rmSync(filePath);
  updateBarrelFile(hooksDir);

  return { slug: ctx.params.slug, status: "removed" };
});
