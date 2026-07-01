import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper to convert JSON fields to DSL
function generateDslFragment(slug: string, data: any) {
  let fieldsStr = "";
  for (const field of data.fields || []) {
    let typeDef = field.type;
    
    if (field.type === "array") {
      typeDef = `${field.items}[]`;
    } else if (field.type === "relationship") {
      typeDef = `link("${field.target}")`;
    } else if (field.type === "select" || field.type === "enum") {
      typeDef = "[" + (field.options || field.values).map((v: string) => '"' + v + '"').join(", ") + "]";
    }

    let modifiers = "";
    if (field.unique) modifiers += " @unique";
    if (field.default !== undefined) modifiers += " @default(" + (typeof field.default === "string" ? '"' + field.default + '"' : field.default) + ")";
    if (field.optional) modifiers += " @optional";

    fieldsStr += `    ${field.name}: ${typeDef}${modifiers};\n`;
  }

  let authStr = data.auth ? "  auth: true;\n" : "";

  return `\ncollection ${slug} {\n${authStr}  fields: {\n${fieldsStr}  }\n}\n`;
}

async function getProjectDir(projectId: string) {
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  if (project.docs.length === 0) return null;
  return project.docs[0].targetDir as string;
}

// GET all collections
app.router.get("/projects/:projectId/collections", async (ctx) => {
  const targetDir = await getProjectDir(ctx.params.projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  
  const schemaPath = join(targetDir, "radiant", "runtime", "schema.json");
  if (!existsSync(schemaPath)) return [];
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  return schema.collections || [];
});

// POST / PUT helper
async function saveCollection(projectId: string, slug: string, data: any, isUpdate: boolean) {
  const targetDir = await getProjectDir(projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const collectionsDir = join(targetDir, "radiant", "collections");
  if (!existsSync(collectionsDir)) mkdirSync(collectionsDir, { recursive: true });
  
  const filePath = join(collectionsDir, `${slug}.radiant`);
  
  if (!isUpdate && existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Collection already exists" }), { status: 409 });
  }
  if (isUpdate && !existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Collection not found" }), { status: 404 });
  }

  const existingContent = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  const dslFragment = generateDslFragment(slug, data);
  writeFileSync(filePath, dslFragment);

  try {
    const cmd = `bun run ../../packages/cli/src/index.ts generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: targetDir });
    return { collection: slug, status: "compiled", dsl: dslFragment };
  } catch (error: any) {
    if (existingContent === null) rmSync(filePath, { force: true });
    else writeFileSync(filePath, existingContent);
    return new Response(JSON.stringify({ error: "Validation failed, rolled back", details: error.message }), { status: 400 });
  }
}

// POST create collection
app.router.post("/projects/:projectId/collections", async (ctx) => {
  const data = ctx.body as any;
  const slug = data.slug || data.name;
  return saveCollection(ctx.params.projectId, slug, data, false);
}, { body: t.Any() });

// PUT update collection
app.router.put("/projects/:projectId/collections/:slug", async (ctx) => {
  return saveCollection(ctx.params.projectId, ctx.params.slug, ctx.body, true);
}, { body: t.Any() });

// DELETE collection
app.router.delete("/projects/:projectId/collections/:slug", async (ctx) => {
  const targetDir = await getProjectDir(ctx.params.projectId);
  if (!targetDir) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

  const collectionsDir = join(targetDir, "radiant", "collections");
  const filePath = join(collectionsDir, `${ctx.params.slug}.radiant`);
  
  if (!existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Collection not found" }), { status: 404 });
  }

  const existingContent = readFileSync(filePath, "utf8");
  rmSync(filePath);

  try {
    const cmd = `bun run ../../packages/cli/src/index.ts generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: targetDir });
    return { collection: ctx.params.slug, status: "compiled", removed: true };
  } catch (error: any) {
    writeFileSync(filePath, existingContent);
    return new Response(JSON.stringify({ error: "Validation failed, rolled back", details: error.message }), { status: 400 });
  }
});
