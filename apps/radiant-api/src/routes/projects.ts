import { app } from "../server";
import { t } from "@codesordinatestudio/radiant-bun";
import { scaffoldTsProject } from "@radiant/cli/src/scaffolds/bun";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

// Use the monorepo root's `temps/` directory
const rootTempsDir = join(process.cwd(), "..", "..", "temps");
if (!existsSync(rootTempsDir)) {
  mkdirSync(rootTempsDir, { recursive: true });
}

// Scaffold a new project
app.router.post("/projects", async (ctx) => {
  const { name } = ctx.body as { name: string };
  const projectId = randomUUID();
  const targetDir = join(rootTempsDir, projectId);
  
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Force CLI into non-interactive mode for SQLite
  process.env.NODE_ENV = "test";
  process.env.TEST_DB_CHOICE = "1"; // SQLite

  try {
    // Scaffold the project using Radiant's internal CLI logic
    await scaffoldTsProject(targetDir);

    const { execSync } = await import("child_process");
    try {
      execSync("bun install", { cwd: targetDir, stdio: "pipe" });
    } catch (err: any) {
      console.error("Bun install failed with output:", err.stdout?.toString(), err.stderr?.toString());
      throw err;
    }

    const projectRadiantDir = join(targetDir, "radiant");
    if (!existsSync(projectRadiantDir)) {
      mkdirSync(projectRadiantDir, { recursive: true });
    }
    const { writeFileSync } = await import("fs");
    writeFileSync(join(projectRadiantDir, "config.radiant"), `config {
  apiPrefix: "/api"
}
`);

    // Save project metadata to our internal Radiant database
    const apiKey = `rk_${randomUUID()}`;
    const project = await app.adapter.create("projects", {
      id: projectId,
      projectId,
      apiKey,
      targetDir,
      status: "ready"
    });

    return {
      projectId,
      apiKey,
      targetDir,
      status: "scaffolded",
      message: `Project ${name} successfully scaffolded with SQLite database.`,
    };
  } catch (error: any) {
    console.error("Error scaffolding project:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
}, {
  body: t.Object({
    name: t.String(),
  }),
});

// Build the project
app.router.post("/projects/:projectId/build", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  try {
    // Update status to building
    await app.adapter.update("projects", p.id as string, { status: "building" });

    // Run bun build inside the project directory
    const { stdout, stderr } = await execAsync("bun run build", { cwd: p.targetDir as string });
    
    // Update status back to ready
    await app.adapter.update("projects", p.id as string, { status: "ready" });

    return {
      status: "built",
      stdout,
      stderr
    };
  } catch (error: any) {
    await app.adapter.update("projects", p.id as string, { status: "failed" });
    return new Response(JSON.stringify({ error: "Build failed", details: error.message }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
});

// Deploy (Run the built project on a specific port)
const runningProcesses = new Map<string, any>();
let nextPort = 9200;

app.router.post("/projects/:projectId/deploy", async (ctx) => {
  const projectId = ctx.params.projectId;
  const project = await app.adapter.find("projects", { where: { projectId: { eq: projectId } } });
  
  if (project.docs.length === 0) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const p = project.docs[0];
  const port = nextPort++;

  // Note: For a robust system we would use pm2, docker, or bun spawn. 
  // Here we'll just spawn it in the background.
  try {
    if (runningProcesses.has(projectId)) {
      // Kill existing process
      const oldProcess = runningProcesses.get(projectId);
      oldProcess.kill();
    }

    const { spawn } = await import("child_process");
    const child = spawn("bun", ["run", "dist/index.js"], {
      cwd: p.targetDir as string,
      env: {
        ...process.env,
        PORT: port.toString()
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Wait briefly for the process to either start listening or crash
    const started = await new Promise<boolean>((resolve) => {
      let resolved = false;
      const settle = (ok: boolean) => {
        if (!resolved) { resolved = true; resolve(ok); }
      };

      child.on("error", () => settle(false));
      child.on("exit", () => settle(false));

      // Give it 3s to bind; if still alive, probe the port
      setTimeout(async () => {
        if (child.killed || child.exitCode !== null) return settle(false);
        try {
          const res = await fetch(`http://localhost:${port}/`);
          settle(res.ok || res.status > 0);
        } catch {
          settle(false);
        }
      }, 3000);
    });

    if (!started) {
      runningProcesses.delete(projectId);
      try { child.kill(); } catch {}
      return new Response(JSON.stringify({ error: "Deploy failed: server did not start listening on the assigned port", port }), { status: 500, headers: { "Content-Type": "application/json" }});
    }

    runningProcesses.set(projectId, child);

    return {
      status: "deployed",
      url: "http://localhost:" + port,
      port
    };
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Deploy failed", details: error.message }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
});
