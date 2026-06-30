import chokidar from 'chokidar';
import { resolve } from 'path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { generateCompilerOutput } from './cli';
import { scaffoldTsProject } from './scaffolds/bun';

export async function devCommand(options: { runtime?: string, dir?: string }) {
  const dir = options.dir || resolve(process.cwd(), 'radiant');
  let runtime = options.runtime;

  if (!runtime) {
    const runtimeSelect = await p.select({
      message: 'Choose your target runtime environment',
      options: [
        { value: 'ts', label: 'TypeScript (Bun)', hint: 'Generates a fast, modular Bun application' }
      ]
    });

    if (p.isCancel(runtimeSelect)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    
    runtime = runtimeSelect as string;
  }

  const rootDir = resolve(dir, '..');

  switch (runtime) {
    case 'ts':
      await scaffoldTsProject(rootDir);
      break;
    default:
      console.warn(pc.yellow(`\n⚠️ Unknown runtime '${runtime}'. Skipping scaffolding...`));
  }

  console.log(`\n${pc.bgCyan(pc.black(' RADIANT '))} ${pc.cyan('Starting dev watcher on')} ${pc.dim(dir)}`);
  
  // Run an initial build
  generateCompilerOutput({ runtime, dir, isDev: true });

  const watcher = chokidar.watch(dir, {
    ignored: [/(^|[\/\\])\../, /runtime[\/\\]schema\.json$/, /runtime\.ts$/, /radiant-types\.ts$/], // ignore dotfiles and generated outputs
    persistent: true
  });

  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedBuild = (path: string, type: string) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      const time = new Date().toLocaleTimeString();
      console.log(`\n${pc.dim(time)} ${pc.blue('↻')} File ${pc.bold(path)} has been ${type}. Rebuilding...`);
      generateCompilerOutput({ runtime, dir, isDev: true });
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
