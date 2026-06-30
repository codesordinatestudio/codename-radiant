import type { RadiantRuntime } from "../main/runtime";

export function setupMonitoring(app: RadiantRuntime<any>) {
  const monitoringConfig = app.schema.monitoring;

  if (monitoringConfig?.healthCheck?.enabled) {
    const path = monitoringConfig.healthCheck.path || "/health";
    
    app.router.get(path, () => {
      return {
        status: "ok",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
    });
  }
}
