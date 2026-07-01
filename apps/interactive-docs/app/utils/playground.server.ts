import { randomBytes } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

// Manage active sessions in memory
type Session = {
  id: string;
  port: number;
  process: ChildProcess;
  expiresAt: number;
};

const sessions = new Map<string, Session>();
const PLAYGROUND_DIR = path.join(process.cwd(), ".playgrounds");

// Track next available port (starting from 8000)
let nextPort = 8000;

export async function createSession(): Promise<string> {
  const sessionId = randomBytes(16).toString("hex");
  const sessionDir = path.join(PLAYGROUND_DIR, sessionId);
  
  await mkdir(sessionDir, { recursive: true });
  
  // Create an empty config.radiant
  await writeFile(path.join(sessionDir, "config.radiant"), "");
  
  const port = nextPort++;
  
  // Spawn the child process using the CLI
  const cliPath = path.resolve(process.cwd(), "../../packages/cli/bin/radiant.ts");
  
  const child = spawn("bun", ["run", cliPath, "dev", "--dir", sessionDir], {
    env: {
      ...process.env,
      PORT: port.toString(),
    },
    cwd: process.cwd(),
    stdio: "pipe",
  });

  child.stdout?.on("data", (data) => console.log(`[Session ${sessionId}] ${data}`));
  child.stderr?.on("data", (data) => console.error(`[Session ${sessionId}] ${data}`));

  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes from now

  sessions.set(sessionId, {
    id: sessionId,
    port,
    process: child,
    expiresAt,
  });

  return sessionId;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export async function updateSessionRadiant(sessionId: string, radiantCode: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  
  const sessionDir = path.join(PLAYGROUND_DIR, sessionId);
  await writeFile(path.join(sessionDir, "config.radiant"), radiantCode);
  
  // The CLI `dev` command should automatically pick up changes and reload!
}

export async function destroySession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    session.process.kill();
    sessions.delete(sessionId);
  }
  
  const sessionDir = path.join(PLAYGROUND_DIR, sessionId);
  try {
    await rm(sessionDir, { recursive: true, force: true });
  } catch (e) {
    console.error(`Failed to cleanup dir for session ${sessionId}`, e);
  }
}

// Background cleanup job
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now >= session.expiresAt) {
      console.log(`Session ${sessionId} expired. Cleaning up.`);
      destroySession(sessionId);
    }
  }
}, 60 * 1000); // Check every minute
