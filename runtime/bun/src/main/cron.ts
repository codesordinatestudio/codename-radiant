export class CronManager {
  private jobs = new Map<string, { stop(): void }>();

  /**
   * Schedules a cron job to run in the background.
   * @param name Unique identifier for the job
   * @param schedule Cron expression (e.g. "0 * * * *")
   * @param handler Async function to execute
   * @param app Reference to the RadiantRuntime instance
   */
  public schedule(name: string, schedule: string, handler: (app: any) => unknown, app: any) {
    if (this.jobs.has(name)) {
      throw new Error(`[Radiant Cron] A cron job with the name "${name}" is already registered.`);
    }

    const job = Bun.cron(schedule, async () => {
      try {
        await handler(app);
      } catch (err) {
        console.error(`[Radiant Cron] Job "${name}" failed:`, err);
      }
    });

    this.jobs.set(name, job);
    return job;
  }

  /**
   * Stops a specific cron job by name
   * @param name Unique identifier of the job to stop
   * @returns true if stopped, false if not found
   */
  public stop(name: string): boolean {
    const job = this.jobs.get(name);
    if (job && typeof job.stop === "function") {
      job.stop();
      this.jobs.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Safely stops all running cron jobs and clears the registry
   */
  public stopAll(): void {
    for (const [name, job] of this.jobs.entries()) {
      if (typeof job.stop === "function") {
        try {
          job.stop();
        } catch (e) {
          console.error(`[Radiant Cron] Error stopping job "${name}":`, e);
        }
      }
    }
    this.jobs.clear();
  }

  /**
   * Returns a list of all currently running cron job names
   */
  public list(): string[] {
    return Array.from(this.jobs.keys());
  }
}
