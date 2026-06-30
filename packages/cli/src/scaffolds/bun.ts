import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import * as p from "@clack/prompts";
import pc from "picocolors";

export async function scaffoldTsProject(rootDir: string) {
  const pkgJsonPath = join(rootDir, "package.json");
  if (!existsSync(pkgJsonPath)) {
    p.intro(pc.bgMagenta(pc.white(" Radiant Framework ")));

    const s = p.spinner();

    s.start("Initializing a new Bun project");
    execSync("bun init -y", { stdio: "ignore", cwd: rootDir });
    const defaultIndex = join(rootDir, "index.ts");
    if (existsSync(defaultIndex)) rmSync(defaultIndex);
    s.stop("Bun project initialized");

    let dbChoice = process.env.TEST_DB_CHOICE || "1";
    if (process.env.NODE_ENV !== "test") {
      const dbSelect = await p.select({
        message: "Choose your Database Adapter",
        options: [
          { value: '1', label: 'SQLite', hint: 'Default, zero config' },
          { value: '2', label: 'PostgreSQL' },
          { value: '3', label: 'MongoDB' },
          { value: '4', label: 'Redis' },
          { value: '5', label: 'SurrealDB' }
        ],
      });
      if (p.isCancel(dbSelect)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }
      dbChoice = dbSelect as string;
    }

    const useSqlite = dbChoice === '1';
    const usePostgres = dbChoice === '2';
    const useMongo = dbChoice === '3';
    const useRedis = dbChoice === '4';
    const useSurreal = dbChoice === '5';

    let isLinked = false;

    if (process.env.NODE_ENV !== "test") {
      s.start("Installing @codesordinatestudio/radiant-bun");
      let installCmd = 'bun add @codesordinatestudio/radiant-bun@latest';
      if (useSqlite) installCmd += ' @codesordinatestudio/radiant-plugin-sqlite@latest';
      else if (usePostgres) installCmd += ' @codesordinatestudio/radiant-plugin-postgres@latest';
      else if (useMongo) installCmd += ' @codesordinatestudio/radiant-plugin-mongodb@latest';
      else if (useRedis) installCmd += ' @codesordinatestudio/radiant-plugin-redis@latest';
      else if (useSurreal) installCmd += ' @codesordinatestudio/radiant-plugin-surrealdb@latest';
      try {
        execSync(installCmd, { stdio: "ignore", cwd: rootDir });
        s.stop("Dependencies installed from NPM");
      } catch (e) {
        s.stop("NPM fetch failed. Using local linked packages");
        isLinked = true;
        p.note("Will write link: dependencies to package.json", "Fallback");
      }
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    pkgJson.scripts = {
      ...pkgJson.scripts,
      dev: "bun run --hot src/index.ts",
      build: "bun build src/index.ts --outdir dist --target bun",
    };
    
    pkgJson.dependencies = {
      ...pkgJson.dependencies,
      "@codesordinatestudio/radiant-bun": isLinked ? "link:@codesordinatestudio/radiant-bun" : "latest"
    };
    if (useSqlite) pkgJson.dependencies["@codesordinatestudio/radiant-plugin-sqlite"] = isLinked ? "link:@codesordinatestudio/radiant-plugin-sqlite" : "latest";
    if (usePostgres) pkgJson.dependencies["@codesordinatestudio/radiant-plugin-postgres"] = isLinked ? "link:@codesordinatestudio/radiant-plugin-postgres" : "latest";
    if (useMongo) pkgJson.dependencies["@codesordinatestudio/radiant-plugin-mongodb"] = isLinked ? "link:@codesordinatestudio/radiant-plugin-mongodb" : "latest";
    if (useRedis) pkgJson.dependencies["@codesordinatestudio/radiant-plugin-redis"] = isLinked ? "link:@codesordinatestudio/radiant-plugin-redis" : "latest";
    if (useSurreal) pkgJson.dependencies["@codesordinatestudio/radiant-plugin-surrealdb"] = isLinked ? "link:@codesordinatestudio/radiant-plugin-surrealdb" : "latest";
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

    if (process.env.NODE_ENV !== "test") {
      s.start("Running bun install");
      try {
        execSync("bun install", { stdio: "ignore", cwd: rootDir });
        s.stop("Packages installed");
      } catch (e) {
        s.stop("Bun install failed.");
      }
    }

    const srcDir = join(rootDir, "src");
    if (!existsSync(srcDir)) mkdirSync(srcDir);

    const publicDir = join(rootDir, "public");
    if (!existsSync(publicDir)) mkdirSync(publicDir);

    const indexHtmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Radiant Engine</title>
  <style>
    :root {
      --bg: #030407;
      --border: rgba(255, 255, 255, 0.08);
      --text: #ffffff;
      --text-muted: #8a94a6;
      --accent: #22d3ee;
      --glow: rgba(34, 211, 238, 0.15);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 50% 0%, var(--glow) 0%, transparent 40%),
        radial-gradient(circle at 50% 100%, rgba(244, 114, 182, 0.05) 0%, transparent 40%);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }

    .container {
      width: 100%;
      max-width: 560px;
      text-align: center;
      position: relative;
    }

    .container::before {
      content: '';
      position: absolute;
      inset: -2px;
      background: linear-gradient(180deg, var(--accent), transparent);
      border-radius: 26px;
      z-index: -1;
      opacity: 0.2;
      filter: blur(8px);
    }

    .card {
      background: rgba(10, 12, 18, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 48px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(34, 211, 238, 0.1);
      border: 1px solid rgba(34, 211, 238, 0.2);
      color: var(--accent);
      padding: 6px 12px;
      border-radius: 99px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      background: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1); }
    }

    h1 {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      background: linear-gradient(180deg, #fff, #a1a1aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    p.description {
      color: var(--text-muted);
      font-size: 16px;
      margin-bottom: 40px;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: rgba(255, 255, 255, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
      color: #e4e4e7;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .btn-primary {
      background: var(--text);
      color: var(--bg);
      border: 1px solid var(--text);
    }

    .btn-primary:hover {
      background: transparent;
      color: var(--text);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .footer {
      margin-top: 40px;
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
    }

    .footer-line {
      height: 1px;
      background: var(--border);
      flex: 1;
      max-width: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="badge">
        <span class="badge-dot"></span>
        API Online
      </div>
      <h1>Radiant Engine</h1>
      <p class="description">
        Your Radiant engine is running beautifully.<br/>
        API endpoints are mounted under <code>/api</code>.
      </p>
      
      <div class="actions">
        <a href="/api/docs" class="btn btn-primary">View API Docs</a>
        <a href="/api" class="btn btn-secondary">API Root</a>
      </div>
    </div>
    
    <div class="footer">
      <div class="footer-line"></div>
      Powered by Radiant Engine
      <div class="footer-line"></div>
    </div>
  </div>
</body>
</html>`;
    writeFileSync(join(publicDir, "index.html"), indexHtmlContent);

    let imports = `import { createRadiant } from "../radiant/runtime";\n`;
    let adapterConfig = "";

    if (useSqlite) {
      imports += `import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";\n`;
      adapterConfig = `  adapter: sqlite({ url: process.env.DATABASE_URL! })`;
    } else if (usePostgres) {
      imports += `import { postgres } from "@codesordinatestudio/radiant-plugin-postgres";\n`;
      adapterConfig = `  adapter: postgres({ url: process.env.DATABASE_URL! })`;
    } else if (useMongo) {
      imports += `import { mongodb } from "@codesordinatestudio/radiant-plugin-mongodb";\n`;
      adapterConfig = `  adapter: mongodb({ url: process.env.DATABASE_URL! })`;
    } else if (useRedis) {
      imports += `import { redis } from "@codesordinatestudio/radiant-plugin-redis";\n`;
      adapterConfig = `  adapter: redis({ url: process.env.DATABASE_URL! })`;
    } else if (useSurreal) {
      imports += `import { surrealdb } from "@codesordinatestudio/radiant-plugin-surrealdb";\n`;
      adapterConfig = `  adapter: surrealdb({ url: process.env.DATABASE_URL!, user: "root", pass: "root", ns: "test", db: "test" })`;
    }

    const appTsContent = `${imports}
export const app = createRadiant({
${adapterConfig}
});
`;
    writeFileSync(join(srcDir, "app.ts"), appTsContent);

    const accessTsContent = `import { app } from "./app";

// Attach access control rules
// e.g., app.access("users", { read: () => true });
`;
    writeFileSync(join(srcDir, "access.ts"), accessTsContent);

    const customRoutesTsContent = `import { app } from "./app";
import { t } from "@codesordinatestudio/radiant-bun";

// Custom routes
app.router.get(
  "/greeting",
  () => ({ greeting: "hello from radiant" }),
  {
    response: t.Object({
      greeting: t.String(),
    }),
  }
);
`;
    writeFileSync(join(srcDir, "custom-routes.ts"), customRoutesTsContent);

    const indexTsContent = `import { app } from "./app";

// Import modules so they register with the app
import "./access";
import "./custom-routes";

// Default root index page serving from public directory
app.router.get("/", () => {
  return new Response(Bun.file("public/index.html"));
});

app.start({ port: 3000 }).catch(console.error);
`;
    writeFileSync(join(srcDir, "index.ts"), indexTsContent);

    let envContent = `JWT_SECRET=${randomBytes(16).toString('hex')}\n`;
    if (useSqlite) envContent += `DATABASE_URL=radiant.sqlite\n`;
    else if (usePostgres) envContent += `DATABASE_URL=postgres://postgres:postgres@localhost:5432/radiant_app\n`;
    else if (useMongo) envContent += `DATABASE_URL=mongodb://localhost:27017/radiant_app\n`;
    else if (useRedis) envContent += `DATABASE_URL=redis://localhost:6379\n`;
    else if (useSurreal) envContent += `DATABASE_URL=http://localhost:8000\n`;
    writeFileSync(join(rootDir, '.env'), envContent);

    p.note(
      `${pc.blue("src/app.ts")} created with app initialization\n${pc.blue("src/access.ts")} created for access rules\n${pc.blue("src/custom-routes.ts")} created for custom routes\n${pc.blue("src/index.ts")} created with server implementation\n${pc.blue(".env")} created with JWT_SECRET`,
      "Scaffold Complete",
    );

    p.outro(`✨ All set! Run ${pc.green("radiant dev")} to start coding!`);
  }
}
