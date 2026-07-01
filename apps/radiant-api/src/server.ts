import { RadiantRuntime, RadiantError } from "@codesordinatestudio/radiant-bun";
process.env.RADIANT_LOCAL_BUILDER = "1";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";
import schema from "../radiant/runtime/schema.json";
import type { Collections } from "../radiant-types";

import { existsSync, mkdirSync } from "fs";

// Ensure tmp directory exists
if (!existsSync("./tmp")) mkdirSync("./tmp");

// Initialize the Radiant runtime using the compiled AST schema
export const app = new RadiantRuntime<Collections>(schema as any, {
  adapter: sqlite({ url: "file:./tmp/builder.sqlite" }),
});

import { rmSync } from "fs";
import { join } from "path";

// Cleanup cron job: every hour, wipe projects older than 24 hours
setInterval(async () => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oldProjects = await app.adapter.find("projects", {
      where: {
        createdAt: { lt: twentyFourHoursAgo }
      }
    });

    for (const project of oldProjects.docs) {
      console.log(`Cleaning up old project: ${project.projectId}`);
      if (project.targetDir) {
        try {
          rmSync(project.targetDir as string, { recursive: true, force: true });
        } catch (err) {
          console.error(`Failed to remove directory ${project.targetDir}:`, err);
        }
      }
      await app.adapter.delete("projects", {
        where: { id: { eq: project.id } }
      });
    }
  } catch (err) {
    console.error("Cleanup cron job failed:", err);
  }
}, 60 * 60 * 1000);

// Import route modules
await import("./routes");
await import("./cron");

// Define a global hook to secure all builder API endpoints with a Bearer token
app.plugins.push({
  name: "auth-guard",
  beforeRequest: async (ctx) => {
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer RADIANT_BUILDER_SECRET")) {
      throw RadiantError.Unauthorized("Unauthorized");
    }
  },
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 9100;
app.start({ port });
console.log(`Radiant Builder API is running on http://localhost:${port}`);
