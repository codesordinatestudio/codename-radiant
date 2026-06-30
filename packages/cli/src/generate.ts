import { resolve } from 'path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { generateCompilerOutput } from './cli';
import { scaffoldTsProject } from './scaffolds/bun';

export async function generateCommand(options: { runtime?: string, dir?: string }) {
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

  console.log(`\n${pc.bgCyan(pc.black(' RADIANT '))} ${pc.cyan('Generating artifacts for')} ${pc.dim(dir)}`);
  
  generateCompilerOutput({ runtime, dir, isDev: false });
}
