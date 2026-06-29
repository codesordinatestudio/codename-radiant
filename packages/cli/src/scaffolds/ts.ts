import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export async function scaffoldTsProject(rootDir: string) {
  const pkgJsonPath = join(rootDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    p.intro(pc.bgMagenta(pc.white(' Radiant Framework ')));

    const s = p.spinner();

    s.start('Initializing a new Bun project');
    execSync('bun init -y', { stdio: 'ignore', cwd: rootDir });
    const defaultIndex = join(rootDir, 'index.ts');
    if (existsSync(defaultIndex)) rmSync(defaultIndex);
    s.stop('Bun project initialized');
    
    let dbChoice = "1";
    if (process.env.NODE_ENV !== 'test') {
      const dbSelect = await p.select({
        message: 'Choose your Database Adapter',
        options: [
          { value: '1', label: 'Memory', hint: 'Default, Development only' },
          { value: '2', label: 'PostgreSQL' }
        ],
      });
      if (p.isCancel(dbSelect)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }
      dbChoice = dbSelect as string;
    }

    const usePostgres = dbChoice === '2';

    let isLinked = false;

    if (process.env.NODE_ENV !== 'test') {
      s.start('Installing @codesordinatestudio/radiant-bun');
      let installCmd = 'bun add @codesordinatestudio/radiant-bun@latest';
      if (usePostgres) {
        installCmd += ' @codesordinatestudio/radiant-plugin-postgres@latest';
      }
      try {
        execSync(installCmd, { stdio: 'ignore', cwd: rootDir });
        s.stop('Dependencies installed from NPM');
      } catch (e) {
        s.stop('NPM fetch failed. Using local linked packages');
        isLinked = true;
        p.note('Will write link: dependencies to package.json', 'Fallback');
      }
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    pkgJson.scripts = {
      ...pkgJson.scripts,
      "dev": "bun run --hot src/index.ts",
      "build": "bun build src/index.ts --outdir dist --target bun"
    };
    pkgJson.dependencies = {
      ...pkgJson.dependencies,
      "@codesordinatestudio/radiant-bun": isLinked ? "link:@codesordinatestudio/radiant-bun" : "latest"
    };
    if (usePostgres) {
      pkgJson.dependencies["@codesordinatestudio/radiant-plugin-postgres"] = isLinked ? "link:@codesordinatestudio/radiant-plugin-postgres" : "latest";
    }
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

    if (process.env.NODE_ENV !== 'test') {
      s.start('Running bun install');
      execSync('bun install', { stdio: 'ignore', cwd: rootDir });
      s.stop('Packages installed');
    }

    const srcDir = join(rootDir, 'src');
    if (!existsSync(srcDir)) mkdirSync(srcDir);

    let imports = `import { createRadiant } from "../radiant/runtime";\n`;
    let adapterConfig = '';

    if (usePostgres) {
      imports += `import { postgres } from "@codesordinatestudio/radiant-plugin-postgres";\n`;
      adapterConfig = `  adapter: postgres({ url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/radiant" })`;
    } else {
      imports += `import { MemoryAdapter } from "@codesordinatestudio/radiant-bun";\n`;
      adapterConfig = `  adapter: new MemoryAdapter()`;
    }

    const appTsContent = `${imports}
export const app = createRadiant({
${adapterConfig}
});
`;
    writeFileSync(join(srcDir, 'app.ts'), appTsContent);

    const accessTsContent = `import { app } from "./app";

// Attach access control rules
// e.g., app.access("users", { read: () => true });
`;
    writeFileSync(join(srcDir, 'access.ts'), accessTsContent);

    const customRoutesTsContent = `import { app } from "./app";

// Custom routes
app.router.get("/", () => {
  return Response.json({ message: "Welcome to Radiant API!" });
});
`;
    writeFileSync(join(srcDir, 'custom-routes.ts'), customRoutesTsContent);

    const indexTsContent = `import { app } from "./app";

// Import modules so they register with the app
import "./access";
import "./custom-routes";

app.start({ port: 3000 }).catch(console.error);
`;
    writeFileSync(join(srcDir, 'index.ts'), indexTsContent);

    const envContent = `JWT_SECRET=${randomBytes(16).toString('hex')}\n`;
    writeFileSync(join(rootDir, '.env'), envContent);

    p.note(
      `${pc.blue('src/app.ts')} created with app initialization\n${pc.blue('src/access.ts')} created for access rules\n${pc.blue('src/custom-routes.ts')} created for custom routes\n${pc.blue('src/index.ts')} created with server implementation\n${pc.blue('.env')} created with JWT_SECRET`,
      'Scaffold Complete'
    );

    p.outro(`✨ All set! Run ${pc.green('radiant dev')} to start coding!`);
  }
}
