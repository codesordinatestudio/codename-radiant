import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import autocannon, { type Result } from "autocannon";
import numeral from "numeral";

interface Scenario {
  title: string;
  path: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

interface Target {
  name: "radiant" | "elysia" | "bun" | "go";
  port: number;
  source: string;
  binary: string;
  runtime: "bun" | "go";
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const duration = Number(Bun.env.BENCH_DURATION ?? 10);
const connections = Number(Bun.env.BENCH_CONNECTIONS ?? 450);
const pipelining = Number(Bun.env.BENCH_PIPELINING ?? 1);
const basePort = Number(Bun.env.BENCH_PORT ?? 4100);
const selectedTargets = new Set((Bun.env.BENCH_TARGETS ?? "radiant,elysia").split(",").map((name) => name.trim()));
const schemaBody = JSON.stringify({
  someKey: "test",
  someOtherKey: 123,
  requiredKey: [123, 456, 789],
  nullableKey: null,
  multipleTypesKey: true,
  multipleRestrictedTypesKey: "test",
  enumKey: "John",
});

const scenarios: Scenario[] = [
  { title: "hello", path: "/hello" },
  {
    title: "schema",
    path: "/schema?name=test&excitement=123",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-foo": "test",
    },
    body: schemaBody,
  },
];

const allTargets: Target[] = [
  {
    name: "radiant",
    port: basePort,
    source: path.join(dirname, "radiant-server.ts"),
    binary: path.join(os.tmpdir(), "radiant-bench-radiant"),
    runtime: "bun",
  },
  {
    name: "elysia",
    port: basePort + 1,
    source: path.join(dirname, "elysia-server.ts"),
    binary: path.join(os.tmpdir(), "radiant-bench-elysia"),
    runtime: "bun",
  }
];
const targets = allTargets.filter((target) => selectedTargets.has(target.name));

async function compileTarget(target: Target): Promise<void> {
  console.log(`[bench] compiling ${target.name}...`);
  
  if (target.name === "radiant" || target.name === "elysia") {
    await Bun.$`bun build ${target.source} --target bun --outfile ${target.binary}.js`.quiet();
    target.binary = `${target.binary}.js`;
    return;
  }

  await Bun.$`bun build --compile ${target.source} --outfile ${target.binary}`.quiet();
}

function startTarget(target: Target): ChildProcess {
  if (target.name === "radiant") {
    return spawn("bun", ["run", target.binary], {
      cwd: dirname,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BENCH_PORT: String(target.port), PORT: String(target.port), NODE_ENV: "production" },
    });
  }

  return spawn("bun", ["run", target.binary], {
    cwd: dirname,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BENCH_PORT: String(target.port), PORT: String(target.port), NODE_ENV: "production" },
  });
}

async function waitForReady(target: Target): Promise<void> {
  const url = `http://localhost:${target.port}/__bench/ready`;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server still starting
    }
    await Bun.sleep(250);
  }
  throw new Error(`${target.name} never became ready`);
}

function runScenario(target: Target, scenario: Scenario): Promise<Result> {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        title: `${target.name} ${scenario.title}`,
        url: `http://localhost:${target.port}${scenario.path}`,
        method: scenario.method ?? "GET",
        headers: scenario.headers,
        body: scenario.body,
        connections,
        pipelining,
        duration,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
  });
}

function formatNumber(value: number): string {
  return numeral(value).format("0,0");
}

function printReport(results: Array<{ target: Target; scenario: Scenario; result: Result }>): void {
  const line = "-".repeat(92);
  console.log(`\n${targets.map((target) => target.name).join(" vs ")} local baseline`);
  console.log(`Duration=${duration}s Connections=${connections} Pipelining=${pipelining}`);
  console.log(line);
  console.log(`${"Scenario".padEnd(12)} ${"Target".padEnd(10)} ${"Req/s avg".padStart(12)} ${"p99 ms".padStart(8)}`);
  console.log(line);

  for (const scenario of scenarios) {
    for (const target of targets) {
      const result = results.find((entry) => entry.target.name === target.name && entry.scenario === scenario)?.result;
      if (!result) continue;

      console.log(
        `${scenario.title.padEnd(12)} ` +
          `${target.name.padEnd(10)} ` +
          `${formatNumber(result.requests.average).padStart(12)} ` +
          `${String(result.latency.p99).padStart(8)}`,
      );
    }
  }

  console.log(line);
}

async function main() {
  const children: ChildProcess[] = [];
  const results: Array<{ target: Target; scenario: Scenario; result: Result }> = [];

  try {
    for (const target of targets) await compileTarget(target);

    for (const target of targets) {
      console.log(`[bench] starting ${target.name} on ${target.port}`);
      const child = startTarget(target);
      children.push(child);
      child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[${target.name}:err] ${chunk}`));
      await waitForReady(target);
    }

    await Bun.sleep(2_000);

    for (const scenario of scenarios) {
      for (const target of targets) {
        console.log(`[bench] ${target.name}: ${scenario.title}`);
        results.push({ target, scenario, result: await runScenario(target, scenario) });
      }
    }

    printReport(results);
  } finally {
    for (const child of children) child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("[bench] Fatal:", error);
  process.exit(1);
});
