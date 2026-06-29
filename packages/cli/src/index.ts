import { Command } from 'commander';

const program = new Command();

program
  .name('radiant')
  .description('CLI for Radiant DSL')
  .version('0.0.1');

program.command('generate')
  .description('Generate the radiant DSL into a schema.json and output runtime')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action(async (options) => {
    const { generateCommand } = await import('./generate');
    await generateCommand(options);
  });

program.command('init')
  .description('Initialize a new Radiant project in the current directory')
  .option('-d, --dir <path>', 'Path to initialize the radiant project')
  .action(async (options) => {
    const { initCommand } = await import('./init');
    await initCommand(options);
  });

program.command('dev')
  .description('Watch the radiant DSL and rebuild on changes')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action(async (options) => {
    const { devCommand } = await import('./dev');
    await devCommand(options);
  });

program.command('lsp')
  .description('Run the Radiant Language Server')
  .action(async () => {
    // We will dynamically import the LSP so it doesn't run during a normal build
    await import('./lsp/server');
  });

program.parse(process.argv);
