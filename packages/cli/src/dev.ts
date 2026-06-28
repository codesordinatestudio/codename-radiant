import chokidar from 'chokidar';
import { resolve } from 'path';
import { buildCommand } from './cli';

export function devCommand(options: { runtime?: string, dir?: string }) {
  const dir = options.dir || resolve(process.cwd(), 'radiant');
  const runtime = options.runtime || 'ts';

  console.log(`Starting dev watcher on ${dir}...`);
  
  // Run an initial build
  buildCommand({ runtime, dir, isDev: true });

  const watcher = chokidar.watch(dir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
  });

  watcher
    .on('change', path => {
      console.log(`\nFile ${path} has been changed. Rebuilding...`);
      buildCommand({ runtime, dir, isDev: true });
    })
    .on('unlink', path => {
      console.log(`\nFile ${path} has been removed. Rebuilding...`);
      buildCommand({ runtime, dir, isDev: true });
    });
}
