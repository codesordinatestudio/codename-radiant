import { RadiantQueueManager } from "../utils/queue-manager";

export class CronManager {
  private localJobs = new Map<string, { stop(): void }>();
  private useBullMQ = false;

  constructor() {
    try {
      // Check if QueueManager is initialized
      RadiantQueueManager.getInstance();
      this.useBullMQ = true;
    } catch {
      this.useBullMQ = false;
    }
  }

  /**
   * Schedules a cron job to run in the background.
   * @param name Unique identifier for the job
   * @param schedule Cron expression (e.g. "0 * * * *")
   * @param handler Async function to execute
   * @param app Reference to the RadiantRuntime instance
   */
  public async schedule(name: string, schedule: string, handler: (app: any) => unknown, app: any) {
    if (this.useBullMQ) {
      const qm = RadiantQueueManager.getInstance();
      
      // Register the worker for this specific cron job
      qm.registerWorker("radiant_cron", async (job) => {
        if (job.name === name) {
          try {
            await handler(app);
          } catch (err) {
            console.error(`[Radiant Cron (BullMQ)] Job "${name}" failed:`, err);
            throw err;
          }
        }
      });

      // Add the repeatable job to the queue
      await qm.addJob("radiant_cron", name, {}, {
        repeat: { pattern: schedule },
        jobId: `cron_${name}`,
        removeOnComplete: true,
        removeOnFail: 100
      });
      
    } else {
      if (this.localJobs.has(name)) {
        throw new Error(`[Radiant Cron] A cron job with the name "${name}" is already registered.`);
      }

      const job = Bun.cron(schedule, async () => {
        try {
          await handler(app);
        } catch (err) {
          console.error(`[Radiant Cron] Job "${name}" failed:`, err);
        }
      });

      this.localJobs.set(name, job);
      return job;
    }
  }

  /**
   * Stops a specific cron job by name
   */
  public async stop(name: string): Promise<boolean> {
    if (this.useBullMQ) {
      const qm = RadiantQueueManager.getInstance();
      const queue = qm.getQueue("radiant_cron");
      const repeatableJobs = await queue.getRepeatableJobs();
      const job = repeatableJobs.find(j => j.name === name);
      if (job) {
        await queue.removeRepeatableByKey(job.key);
        return true;
      }
      return false;
    } else {
      const job = this.localJobs.get(name);
      if (job && typeof job.stop === "function") {
        job.stop();
        this.localJobs.delete(name);
        return true;
      }
      return false;
    }
  }

  /**
   * Safely stops all running cron jobs
   */
  public async stopAll(): Promise<void> {
    if (this.useBullMQ) {
      const qm = RadiantQueueManager.getInstance();
      const queue = qm.getQueue("radiant_cron");
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        await queue.removeRepeatableByKey(job.key);
      }
    } else {
      for (const [name, job] of this.localJobs.entries()) {
        if (typeof job.stop === "function") {
          try {
            job.stop();
          } catch (e) {
            console.error(`[Radiant Cron] Error stopping job "${name}":`, e);
          }
        }
      }
      this.localJobs.clear();
    }
  }

  /**
   * Returns a list of all currently running cron job names
   */
  public async list(): Promise<string[]> {
    if (this.useBullMQ) {
      const qm = RadiantQueueManager.getInstance();
      const queue = qm.getQueue("radiant_cron");
      const jobs = await queue.getRepeatableJobs();
      return jobs.map(j => j.name);
    } else {
      return Array.from(this.localJobs.keys());
    }
  }
}
