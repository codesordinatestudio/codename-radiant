import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper to convert JSON fields to DSL
function generateDslFragment(slug: string, data: any) {
  let fieldsStr = "";
  for (const field of data.fields || []) {
    let typeDef = field.type;
    
    // Array type mapping
    if (field.type === "array") {
      typeDef = `${field.items}[]`;
    } 
    // Relationship mapping
    else if (field.type === "relationship") {
      typeDef = `link("${field.target}")`;
    }
    // Select/enum mapping
    else if (field.type === "select" || field.type === "enum") {
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

app.router.post("/projects/:projectId/collections", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  const data = ctx.body as any;
  const slug = data.slug;

  const projectRadiantDir = join(p.targetDir as string, "radiant");
  if (!existsSync(projectRadiantDir)) {
    import("fs").then(fs => fs.mkdirSync(projectRadiantDir, { recursive: true }));
  }
  const collectionsFilePath = join(projectRadiantDir, "collections.radiant");
  
  // Backup existing
  const existingContent = existsSync(collectionsFilePath) ? readFileSync(collectionsFilePath, "utf8") : "";
  
  // Append new DSL
  const dslFragment = generateDslFragment(slug, data);
  writeFileSync(collectionsFilePath, existingContent + dslFragment);

  try {
    // Validate compilation
    // We run bunx radiant generate --dir radiant --runtime ts inside the target directory
    // Actually we can just run the CLI directly from node_modules since it's installed there
    const cmd = `bun run ../../packages/cli/src/index.ts generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: p.targetDir as string });

    return {
      collection: slug,
      status: "compiled",
      dslFragment
    };
  } catch (error: any) {
    // Rollback
    if (existingContent === "") {
      // we could delete it, but writing empty is fine
      writeFileSync(collectionsFilePath, "");
    } else {
      writeFileSync(collectionsFilePath, existingContent);
    }
    
    return new Response(JSON.stringify({ error: "Validation failed, changes rolled back", details: error.message }), { status: 400, headers: { "Content-Type": "application/json" }});
  }
}, { body: t.Any() });

app.router.delete("/projects/:projectId/collections/:slug", async (ctx) => {
  const projectId = ctx.params.projectId;
  const slug = ctx.params.slug;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  const collectionsFilePath = join(p.targetDir as string, "radiant", "collections.radiant");
  
  if (!existsSync(collectionsFilePath)) {
    return new Response(JSON.stringify({ error: "Collections file not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const existingContent = readFileSync(collectionsFilePath, "utf8");
  
  // Regex to remove the collection block
  const regex = new RegExp(`collection\\s+${slug}\\s*\\{[\\s\\S]*?\\n\\}`, "g");
  const newContent = existingContent.replace(regex, "");

  writeFileSync(collectionsFilePath, newContent);

  try {
    const cmd = `bun run node_modules/@radiant/cli/bin/radiant generate --dir radiant --runtime ts`;
    await execAsync(cmd, { cwd: p.targetDir as string });

    return {
      collection: slug,
      status: "compiled",
      removed: true
    };
  } catch (error: any) {
    writeFileSync(collectionsFilePath, existingContent);
    return new Response(JSON.stringify({ error: "Validation failed", details: error.message }), { status: 400, headers: { "Content-Type": "application/json" }});
  }
});
