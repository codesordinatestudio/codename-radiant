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
  adapter: sqlite({ url: "builder.sqlite" }),
});

import { rmSync } from "fs";
import { join } from "path";

// Cleanup cron job: every hour, wipe projects older than 1 hour
setInterval(async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const oldProjects = await app.adapter.find("projects", {
      where: {
        createdAt: { lt: oneHourAgo }
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
      await app.adapter.delete("projects", project.id as string);
    }
  } catch (err) {
    console.error("Cleanup cron job failed:", err);
  }
}, 60 * 60 * 1000);

// Import route modules
await import("./routes");
await import("./cron");

import jwt from "jsonwebtoken";

// Define a global hook to secure all builder API endpoints with a Bearer token
app.plugins.push({
  name: "auth-guard",
  beforeRequest: async (ctx) => {
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw RadiantError.Unauthorized("Unauthorized");
    }
    
    const token = authHeader.replace("Bearer ", "");
    
    try {
      jwt.verify(token, process.env.JWT_SECRET || "radiant-secret-key");
    } catch (err) {
      throw RadiantError.Unauthorized("Unauthorized: Invalid API Key");
    }
  },
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 9100;
app.start({ port });
console.log(`Radiant Builder API is running on http://localhost:${port}`);
