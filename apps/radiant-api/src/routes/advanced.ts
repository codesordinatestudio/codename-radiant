import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync, readdirSync } from "fs";
import { join } from "path";

async function getProjectDir(projectId: string) {
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  if (project.docs.length === 0) return null;
  return project.docs[0].targetDir as string;
}

function updateBarrelFile(dirPath: string) {
  const files = readdirSync(dirPath).filter(f => f.endsWith(".ts") && f !== "index.ts");
  let barrelContent = `// Auto-generated barrel file\n`;
  for (const file of files) {
    const name = file.replace(".ts", "");
    barrelContent += `import "./${name}";\n`;
  }
  writeFileSync(join(dirPath, "index.ts"), barrelContent);
}

function ensureDirWithBarrel(targetDir: string, dirName: string) {
  const fullPath = join(targetDir, "src", dirName);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
    writeFileSync(join(fullPath, "index.ts"), "// Auto-generated barrel file\n");
  }

  // Ensure src/index.ts imports this barrel
  const indexPath = join(targetDir, "src", "index.ts");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf8");
    if (!indexContent.includes(`import "./${dirName}";`)) {
      writeFileSync(indexPath, `import "./${dirName}";\n${indexContent}`);
    }
  }

  return fullPath;
}

async function saveAdvancedFile(projectId: string, type: "cron" | "realtime" | "queues", slug: string, code: string, isUpdate: boolean) {
  const targetDir = await getProjectDir(projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const dirPath = ensureDirWithBarrel(targetDir, type);
  const filePath = join(dirPath, `${slug}.ts`);

  if (!isUpdate && existsSync(filePath)) return new Response(JSON.stringify({ error: `${type} already exists` }), { status: 409 });
  if (isUpdate && !existsSync(filePath)) return new Response(JSON.stringify({ error: `${type} not found` }), { status: 404 });

  const fileCode = `import { app } from "../app";\n\n${code}\n`;
  writeFileSync(filePath, fileCode);
  updateBarrelFile(dirPath);

  return { slug, status: "saved", type };
}

async function deleteAdvancedFile(projectId: string, type: "cron" | "realtime" | "queues", slug: string) {
  const targetDir = await getProjectDir(projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const dirPath = ensureDirWithBarrel(targetDir, type);
  const filePath = join(dirPath, `${slug}.ts`);

  if (!existsSync(filePath)) return new Response(JSON.stringify({ error: `${type} not found` }), { status: 404 });

  rmSync(filePath);
  updateBarrelFile(dirPath);

  return { slug, status: "removed", type };
}

// ----------------- CRON -----------------
app.router.post("/projects/:projectId/cron", async (ctx) => {
  const { slug, code } = ctx.body as any;
  return saveAdvancedFile(ctx.params.projectId, "cron", slug, code, false);
}, { body: t.Any() });

app.router.put("/projects/:projectId/cron/:slug", async (ctx) => {
  const { code } = ctx.body as any;
  return saveAdvancedFile(ctx.params.projectId, "cron", ctx.params.slug, code, true);
}, { body: t.Any() });

app.router.delete("/projects/:projectId/cron/:slug", async (ctx) => {
  return deleteAdvancedFile(ctx.params.projectId, "cron", ctx.params.slug);
});

// ----------------- REALTIME -----------------
app.router.post("/projects/:projectId/realtime", async (ctx) => {
  const { slug, code } = ctx.body as any;
  return saveAdvancedFile(ctx.params.projectId, "realtime", slug, code, false);
}, { body: t.Any() });

app.router.put("/projects/:projectId/realtime/:slug", async (ctx) => {
  const { code } = ctx.body as any;
  return saveAdvancedFile(ctx.params.projectId, "realtime", ctx.params.slug, code, true);
}, { body: t.Any() });

app.router.delete("/projects/:projectId/realtime/:slug", async (ctx) => {
  return deleteAdvancedFile(ctx.params.projectId, "realtime", ctx.params.slug);
});

// ----------------- QUEUES -----------------
app.router.post("/projects/:projectId/queues", async (ctx) => {
  const { slug, code } = ctx.body as any;
  return saveAdvancedFile(ctx.params.projectId, "queues", slug, code, false);
}, { body: t.Any() });

app.router.put("/projects/:projectId/queues/:slug", async (ctx) => {
  const { code } = ctx.body as any;
  return saveAdvancedFile(ctx.params.projectId, "queues", ctx.params.slug, code, true);
}, { body: t.Any() });

app.router.delete("/projects/:projectId/queues/:slug", async (ctx) => {
  return deleteAdvancedFile(ctx.params.projectId, "queues", ctx.params.slug);
});
