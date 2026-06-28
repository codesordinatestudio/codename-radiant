import { Command } from 'commander';
import { buildCommand } from './cli';
import { devCommand } from './dev';

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

program.command('dev')
  .description('Watch the radiant DSL and rebuild on changes')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action((options) => {
    devCommand(options);
  });

program.command('lsp')
  .description('Run the Radiant Language Server')
  .action(() => {
    // We will dynamically import the LSP so it doesn't run during a normal build
    require('./lsp/server');
  });

program.parse(process.argv);
