import chokidar from 'chokidar';
import { resolve } from 'path';
import { buildCommand } from './cli';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export async function devCommand(options: { runtime?: string, dir?: string }) {
  const dir = options.dir || resolve(process.cwd(), 'radiant');
  const runtime = options.runtime || 'ts';
  const rootDir = resolve(dir, '..');

  if (runtime === 'ts') {
    const pkgJsonPath = join(rootDir, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      console.log('\\n📦 No package.json found. Initializing a new Bun project...');
      execSync('bun init -y', { stdio: 'inherit', cwd: rootDir });
      
      let dbChoice = "1";
      if (process.env.NODE_ENV !== 'test') {
        const rl = readline.createInterface({ input, output });
        console.log('\\n🗄️  Choose your Database Adapter:');
        console.log('1) Memory (Default, Development only)');
        console.log('2) PostgreSQL');
        dbChoice = await rl.question('Enter the number of your choice (1): ');
        rl.close();
      }

      const usePostgres = dbChoice.trim() === '2';

      if (process.env.NODE_ENV !== 'test') {
        console.log('\\n📦 Installing @codesordinatestudio/radiant-bun...');
        let installCmd = 'bun add @codesordinatestudio/radiant-bun';
        if (usePostgres) {
          installCmd += ' @codesordinatestudio/radiant-plugin-postgres';
        }
        try {
          execSync(installCmd, { stdio: 'inherit', cwd: rootDir });
        } catch (e) {
          console.log('\\n⚠️ Could not fetch from NPM. Falling back to local linked packages (bun link)...');
          let linkCmd = 'bun link @codesordinatestudio/radiant-bun';
          if (usePostgres) {
            linkCmd += ' @codesordinatestudio/radiant-plugin-postgres';
          }
          execSync(linkCmd, { stdio: 'inherit', cwd: rootDir });
        }
      }

      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      pkgJson.scripts = {
        ...pkgJson.scripts,
        "dev": "bun run --hot src/index.ts",
        "build": "bun build src/index.ts --outdir dist --target node"
      };
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

      const srcDir = join(rootDir, 'src');
      if (!existsSync(srcDir)) mkdirSync(srcDir);

      let imports = `import { createRadiant } from "../radiant";\\n`;
      let adapterConfig = '';

      if (usePostgres) {
        imports += `import { postgres } from "@codesordinatestudio/radiant-plugin-postgres";\\n`;
        adapterConfig = `  adapter: postgres({ url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/radiant" })`;
      } else {
        imports += `import { MemoryAdapter } from "@codesordinatestudio/radiant-bun";\\n`;
        adapterConfig = `  adapter: new MemoryAdapter()`;
      }

      const indexTsContent = `${imports}
async function main() {
  const app = createRadiant({
  ${adapterConfig}
  });

  app.router.get("/", () => {
    return Response.json({ message: "Welcome to Radiant API!" });
  });

  await app.start({ port: 3000 });
}

main().catch(console.error);
`;
      writeFileSync(join(srcDir, 'index.ts'), indexTsContent);
      console.log('✅ Scaffolded src/index.ts with server implementation.');
    }
  }

  console.log(`\\nStarting dev watcher on ${dir}...`);
  
  // Run an initial build
  buildCommand({ runtime, dir, isDev: true });

  const watcher = chokidar.watch(dir, {
    ignored: [/(^|[\/\\])\../, /schema\.json$/, /index\.ts$/], // ignore dotfiles and generated outputs
    persistent: true
  });

  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedBuild = (path: string, type: string) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      console.log(`\nFile ${path} has been ${type}. Rebuilding...`);
      buildCommand({ runtime, dir, isDev: true });
    }, 100);
  };

  watcher
    .on('change', path => {
      debouncedBuild(path, 'changed');
    })
    .on('unlink', path => {
      debouncedBuild(path, 'removed');
    });
}
