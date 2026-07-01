import { app } from "../server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Run db:sync on a project
app.router.post("/projects/:projectId/db-sync", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  
  try {
    const cmd = `bun run ../../packages/cli/src/index.ts db:sync`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: p.targetDir as string });

    return {
      status: "synced",
      stdout,
      stderr
    };
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "db:sync failed", details: error.message }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
});
