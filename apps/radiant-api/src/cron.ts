import { app } from "./server";
import { rm } from "fs/promises";
import path from "path";

// A cron job to garbage collect old projects (older than 24 hours)
app.cron("cleanup-expired-projects", "0 * * * *", async () => {
  console.log("[Cron] Running 24-hour project cleanup...");
  
  // Find all projects
  const res = await app.adapter.find("projects", { where: {} });
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (const doc of res.docs) {
    // We assume the ID format includes a timestamp or we can just track createdAt.
    // Radiant automatically adds createdAt for collections if we enable timestamps,
    // or we can just fetch the creation time of the folder.
    
    // For now, let's just use the `createdAt` property added by Radiant.
    const createdAt = new Date(doc.createdAt as string).getTime();
    if (now - createdAt > ONE_DAY_MS) {
      console.log(`[Cron] Deleting expired project: ${doc.projectId}`);
      
      try {
        // Delete the directory
        await rm(doc.targetDir as string, { recursive: true });
      } catch (err) {
        console.error(`[Cron] Failed to delete directory ${doc.targetDir}:`, err);
      }
      
      // Delete from DB
      await app.adapter.delete("projects", doc.id as string);
    }
  }
});
