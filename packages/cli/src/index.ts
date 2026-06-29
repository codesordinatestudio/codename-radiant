import { Command } from 'commander';
import { buildCommand } from './cli';
import { devCommand } from './dev';
import { initCommand } from './init';

const program = new Command();

program
  .name('radiant')
  .description('CLI for Radiant DSL')
  .version('0.0.1');

program.command('build')
  .description('Build the radiant DSL into a schema.json')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action((options) => {
    buildCommand(options);
  });

program.command('init')
  .description('Initialize a new Radiant project in the current directory')
  .option('-d, --dir <path>', 'Path to initialize the radiant project')
  .action(async (options) => {
    await initCommand(options);
  });

program.command('dev')
  .description('Watch the radiant DSL and rebuild on changes')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action(async (options) => {
    await devCommand(options);
  });

program.command('lsp')
  .description('Run the Radiant Language Server')
  .action(() => {
    // We will dynamically import the LSP so it doesn't run during a normal build
    require('./lsp/server');
  });

program.parse(process.argv);
